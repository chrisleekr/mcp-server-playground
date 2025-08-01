import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { config } from '@/config/manager';
import { createStorage } from '@/core/storage/storageFactory';
import { Storage } from '@/core/storage/types';

import { loggingContext } from '../http/context';

export class TransportManager {
  private server: Server;
  private storage: Storage;
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();

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

  public async getTransport(
    sessionId: string
  ): Promise<StreamableHTTPServerTransport | undefined> {
    loggingContext.log('debug', 'Getting transport', {
      data: { sessionId },
    });

    // If storage contains sessionId, then check transports with sessionId. If not, then create a new transport with sessionId.
    const session = await this.storage.get(
      `${this.CACHE_KEY_PREFIX}:${sessionId}`
    );
    if (session !== null && session.trim() !== '') {
      if (this.transports.has(sessionId)) {
        loggingContext.log('debug', 'Transport found in transports', {
          data: { sessionId },
        });
        return this.transports.get(sessionId);
      }

      // It exists in storage, but not in transports. Create a new transport with sessionId.
      loggingContext.log(
        'debug',
        'Transport not found in transports, creating new transport'
      );
      const newTransport = await this.createTransport(sessionId);
      this.transports.set(sessionId, newTransport);

      return newTransport;
    }

    // If session is not found, then return undefined.
    return undefined;
  }

  public async hasTransport(sessionId: string): Promise<boolean> {
    loggingContext.log('debug', 'Checking if transport exists', {
      data: { sessionId },
    });
    const session = await this.storage.get(
      `${this.CACHE_KEY_PREFIX}:${sessionId}`
    );
    return session !== null && session.trim() !== '';
  }

  public async createTransport(
    sessionId: string
  ): Promise<StreamableHTTPServerTransport> {
    const transport = new StreamableHTTPServerTransport({
      /**
       * Function that generates a session ID for the transport.
       * The session ID SHOULD be globally unique and cryptographically secure (e.g., a securely generated UUID, a JWT, or a cryptographic hash)
       *
       * Return undefined to disable session management.
       */
      // This is disabled to make stateless mode.
      sessionIdGenerator: undefined,
      // Below is for stateful mode.
      // sessionIdGenerator: (): string => sessionId,
      /**
       * If true, the server will return JSON responses instead of starting an SSE stream.
       * This can be useful for simple request/response scenarios without streaming.
       * Default is false (SSE streams are preferred).
       */
      enableJsonResponse: false,
    });

    // Manually set the session ID to ensure it's available
    transport.sessionId = sessionId;
    loggingContext.log('debug', 'Creating transport', {
      data: { sessionId },
    });

    this.transports.set(sessionId, transport);
    await this.storage.set(
      `${this.CACHE_KEY_PREFIX}:${sessionId}`,
      JSON.stringify({
        createdAt: new Date().toISOString(),
      })
    );

    loggingContext.log('debug', 'Transport created');

    // Set up cleanup handler
    transport.onclose = (): void => {
      const currentSessionId = transport.sessionId;
      if (currentSessionId !== undefined && currentSessionId.trim() !== '') {
        this.transports.delete(currentSessionId);
        void this.storage.delete(
          `${this.CACHE_KEY_PREFIX}:${currentSessionId}`
        );
        loggingContext.log('debug', 'Transport closed and cleaned up', {
          data: {
            transportCount: this.transports.size,
          },
        });
      }
    };

    // Connect the transport to the server
    loggingContext.log('debug', 'Connecting transport to server');
    await this.server.connect(
      transport as StreamableHTTPServerTransport & { sessionId: string }
    );

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
