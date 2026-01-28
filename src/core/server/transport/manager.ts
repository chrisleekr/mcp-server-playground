import { type Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { type Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { type InitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type express from 'express';
import { z } from 'zod';

import { config } from '@/config/manager';
import { MCPEventStore } from '@/core/storage/eventStore';
import { createStorage } from '@/core/storage/storageFactory';
import { type Storage } from '@/core/storage/types';

import { loggingContext } from '../http/context';

/**
 * Manages MCP transport instances and session state for clustered deployments.
 *
 * In a single-server deployment, transports are stored in memory and associated
 * with session IDs. In a clustered deployment, this class enables session replay
 * to recreate transports on any server instance.
 *
 * Session Replay Mechanism:
 * 1. When a client first connects, the InitializeRequest is saved to storage
 * 2. The transport is created and stored in this server's memory
 * 3. If a subsequent request hits a different server instance:
 *    - The session data is retrieved from shared storage (Valkey)
 *    - The InitializeRequest is replayed with mocked req/res objects
 *    - A new transport is created and connected to the MCP server
 *    - The actual request can then be processed normally
 *
 * @see {@link https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/102}
 */
export class TransportManager {
  // MCP server instance.
  private server: Server;

  // Storage for session data to keep track of the initial request.
  private storage: Storage;

  // Event store for SSE resumability support (MCP 2025-06-18)
  private eventStore: MCPEventStore;

  // Map of sessionId to transport in this server memory.
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();

  // Prefix for the session data cache key.
  private readonly CACHE_KEY_PREFIX = 'mcp-session';

  constructor(server: Server) {
    this.server = server;

    try {
      this.storage = createStorage(config.storage);
      // Initialize event store with session TTL for resumability
      this.eventStore = new MCPEventStore(
        this.storage,
        config.storage.sessionTTL
      );
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to create storage', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  public getServer(): Server {
    return this.server;
  }

  public async hasSession(sessionId: string): Promise<boolean> {
    loggingContext.log('debug', 'Checking if session exists', {
      data: { sessionId },
    });
    const session = await this.storage.get(
      `${this.CACHE_KEY_PREFIX}:${sessionId}`
    );
    return session !== null && session.trim() !== '';
  }

  /**
   * Persists session data to shared storage for cross-instance session replay.
   *
   * Called after a successful MCP initialization to store the InitializeRequest.
   * This enables any server instance in the cluster to recreate the transport.
   *
   * @param sessionId - The MCP session ID
   * @param sessionData - Contains the InitializeRequest to be replayed
   */
  public async saveSession(
    sessionId: string,
    sessionData: {
      initialRequest: InitializeRequest;
    }
  ): Promise<void> {
    await this.storage.set(
      `${this.CACHE_KEY_PREFIX}:${sessionId}`,
      JSON.stringify(sessionData),
      config.storage.sessionTTL
    );
  }

  public hasTransport(sessionId: string): boolean {
    return this.transports.has(sessionId);
  }

  public getTransport(
    sessionId: string
  ): StreamableHTTPServerTransport | undefined {
    return this.transports.get(sessionId);
  }

  /**
   * Replays the initial MCP handshake to recreate a transport on this server instance.
   *
   * This is the core of the session replay mechanism for clustered deployments.
   * When a request arrives at a server that doesn't have the transport in memory,
   * this method retrieves the original InitializeRequest from storage and replays it
   * to establish the transport connection.
   *
   * The replay uses mocked Express req/res objects since we don't need the actual
   * HTTP response - we just need to initialize the MCP transport state.
   *
   * @param sessionId - The MCP session ID from the request header
   * @returns The newly created and connected transport
   * @throws {Error} If the session is not found in storage
   */
  public async replayInitialRequest(
    sessionId: string
  ): Promise<StreamableHTTPServerTransport> {
    const session = await this.storage.get(
      `${this.CACHE_KEY_PREFIX}:${sessionId}`
    );
    if (session === null || session.trim() === '') {
      throw new Error('Session not found');
    }

    const SessionDataSchema = z.object({
      initialRequest: z.unknown(),
    });

    let sessionDataRaw: unknown;
    try {
      sessionDataRaw = JSON.parse(session);
    } catch {
      throw new Error('Invalid session payload');
    }

    const parsed = SessionDataSchema.safeParse(sessionDataRaw);
    if (!parsed.success) {
      throw new Error('Invalid session payload');
    }

    const sessionData = parsed.data as {
      initialRequest: InitializeRequest;
    };

    loggingContext.log('debug', 'Replaying initial request', {
      data: { sessionData },
    });

    const transport = this.createTransport(sessionId);

    await transport.handleRequest(
      {
        method: 'POST',
        url: '/mcp',
        headers: {
          accept: ['application/json', 'text/event-stream'],
          'content-type': ['application/json', 'text/event-stream'],
        },
        body: JSON.stringify(sessionData.initialRequest),
      } as unknown as express.Request,
      {
        on: () => {},
        setHeader: () => {},
        write: () => true,
        end: () => {},
        writeHead: () => {
          return {
            end: () => {},
          } as unknown as express.Response;
        },
      } as unknown as express.Response,
      sessionData.initialRequest
    );

    loggingContext.log(
      'debug',
      'Initial request replayed, connecting transport',
      {
        data: {
          sessionId,
          transportCount: this.transports.size,
        },
      }
    );

    await this.server.connect(transport as Transport);

    return transport;
  }

  /**
   * Creates a new StreamableHTTPServerTransport for the given session.
   *
   * The transport is stored in memory and associated with the session ID.
   * An onclose handler is registered to clean up the transport when closed.
   *
   * @param sessionId - The MCP session ID to associate with this transport
   * @returns The newly created transport instance
   */
  public createTransport(sessionId: string): StreamableHTTPServerTransport {
    const transport = new StreamableHTTPServerTransport({
      /**
       * Function that generates a session ID for the transport.
       * The session ID SHOULD be globally unique and cryptographically secure (e.g., a securely generated UUID, a JWT, or a cryptographic hash)
       *
       * Return undefined to disable session management.
       */
      sessionIdGenerator: (): string => sessionId,

      /**
       * If true, the server will return JSON responses instead of starting an SSE stream.
       * This can be useful for simple request/response scenarios without streaming.
       * Default is false (SSE streams are preferred).
       */
      enableJsonResponse: false,

      /**
       * Event store for resumability support (MCP 2025-06-18).
       * Enables clients to reconnect and resume receiving events using Last-Event-ID header.
       * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#resumability-and-redelivery
       */
      eventStore: this.eventStore,
    });

    loggingContext.log('debug', 'Creating transport', {
      data: { sessionId },
    });

    this.transports.set(sessionId, transport);

    loggingContext.log('debug', 'Transport created', {
      data: {
        sessionId: transport.sessionId,
      },
    });

    // Set up cleanup handler
    transport.onclose = (): void => {
      const currentSessionId = transport.sessionId;
      if (currentSessionId !== undefined && currentSessionId.trim() !== '') {
        this.transports.delete(currentSessionId);
        // Shouldn't delete the session data from storage to avoid sunset server deleting the session data.
        // void this.storage.delete(
        //   `${this.CACHE_KEY_PREFIX}:${currentSessionId}`
        // );
        loggingContext.log('debug', 'Transport closed and cleaned up', {
          data: {
            transportCount: this.transports.size,
          },
        });
      }
    };

    return transport;
  }

  public async deleteTransport(sessionId: string): Promise<void> {
    this.transports.delete(sessionId);
    await this.storage.delete(`${this.CACHE_KEY_PREFIX}:${sessionId}`);
    loggingContext.log('info', 'Transport deleted');
  }

  public getTransportCount(): number {
    return this.transports.size;
  }

  public async getAllSessionIds(): Promise<string[]> {
    return this.storage.keys(`${this.CACHE_KEY_PREFIX}:*`);
  }
}
