import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { InitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type express from 'express';

import { config } from '@/config/manager';
import { createStorage } from '@/core/storage/storageFactory';
import { Storage } from '@/core/storage/types';

import { loggingContext } from '../http/context';

export class TransportManager {
  // MCP server instance.
  private server: Server;

  // Storage for session data to keep track of the initial request.
  private storage: Storage;

  // Map of sessionId to transport in this server memory.
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();

  // Prefix for the session data cache key.
  private readonly CACHE_KEY_PREFIX = 'mcp-session';

  constructor(server: Server) {
    this.server = server;

    try {
      this.storage = createStorage(config.storage);
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

  public async saveSession(
    sessionId: string,
    sessionData: {
      initialRequest: InitializeRequest;
    }
  ): Promise<void> {
    // TODO: Make this to be expired after a certain time.
    await this.storage.set(
      `${this.CACHE_KEY_PREFIX}:${sessionId}`,
      JSON.stringify(sessionData)
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

  public async replayInitialRequest(
    sessionId: string
  ): Promise<StreamableHTTPServerTransport> {
    const session = await this.storage.get(
      `${this.CACHE_KEY_PREFIX}:${sessionId}`
    );
    if (session === null || session.trim() === '') {
      throw new Error('Session not found');
    }
    const sessionData = JSON.parse(session) as {
      initialRequest: InitializeRequest;
    };
    loggingContext.log('debug', 'Replaying initial request', {
      data: { sessionData },
    });

    const transport = this.createTransport(sessionId);

    // Replay initial request with dummy request and response.
    // This is to simulate the initial request and response.
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

    await this.server.connect(transport);

    return transport;
  }

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
       * TODO: Make custom event store for persistent storage.
       * Event store for resumability support
       * If provided, resumability will be enabled, allowing clients to reconnect and resume messages
       */
      // eventStore?: EventStore;
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
