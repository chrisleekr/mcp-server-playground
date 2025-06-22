import { randomUUID } from 'node:crypto';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { loggingContext } from '../http/context';

export class TransportManager {
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();

  public getTransport(
    sessionId: string
  ): StreamableHTTPServerTransport | undefined {
    loggingContext.log('debug', 'Getting transport', {
      data: { sessionId },
    });
    return this.transports.get(sessionId);
  }

  public hasTransport(sessionId: string): boolean {
    loggingContext.log('debug', 'Checking if transport exists', {
      data: { sessionId },
    });
    return this.transports.has(sessionId);
  }

  public createTransport(): StreamableHTTPServerTransport {
    const newSessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: (): string => newSessionId,
    });

    // Manually set the session ID to ensure it's available
    transport.sessionId = newSessionId;
    loggingContext.log('debug', 'Creating transport', {
      data: { sessionId: newSessionId },
    });
    this.transports.set(newSessionId, transport);

    loggingContext.log('debug', 'Transport created', {
      data: { sessionId: newSessionId },
    });

    // Set up cleanup handler
    transport.onclose = (): void => {
      const currentSessionId = transport.sessionId;
      if (currentSessionId !== undefined && currentSessionId.trim() !== '') {
        this.transports.delete(currentSessionId);
        loggingContext.log('debug', 'Transport closed and cleaned up', {
          data: {
            sessionId: currentSessionId,
            transportCount: this.transports.size,
          },
        });
      }
    };

    return transport;
  }

  public deleteTransport(sessionId: string): void {
    this.transports.delete(sessionId);
    loggingContext.log('info', 'Transport deleted', {
      data: { sessionId },
    });
  }

  public getTransportCount(): number {
    return this.transports.size;
  }

  public getAllSessionIds(): string[] {
    return Array.from(this.transports.keys());
  }
}
