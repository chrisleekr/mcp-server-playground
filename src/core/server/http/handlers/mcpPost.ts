import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';

import { requireAuth } from '@/core/server/auth';
import type { TransportManager } from '@/core/server/transport';

import { loggingContext } from '../context';

function getSessionId(req: express.Request): string | undefined {
  const sessionIdHeader = req.headers['mcp-session-id'];
  const sessionId =
    typeof sessionIdHeader === 'string' ? sessionIdHeader : undefined;

  return sessionId;
}

export function setupMCPPostHandler(
  app: express.Application,
  server: Server,
  transportManager: TransportManager
): void {
  // Handle MCP POST requests (Streamable HTTP)
  app.post('/mcp', requireAuth(), (req, res) => {
    void (async (): Promise<void> => {
      try {
        const requestBody = req.body as unknown;
        const sessionId = getSessionId(req);

        loggingContext.log('debug', 'POST /mcp request body', {
          data: { requestBody, sessionId },
        });

        let transport: StreamableHTTPServerTransport;

        if (
          sessionId !== undefined &&
          sessionId.trim() !== '' &&
          transportManager.hasTransport(sessionId)
        ) {
          // Reuse existing transport
          const existingTransport = transportManager.getTransport(sessionId);
          if (!existingTransport) {
            loggingContext.log(
              'error',
              'Transport not found despite has() check',
              {
                data: { sessionId },
              }
            );
            throw new Error('Transport not found despite has() check');
          }
          transport = existingTransport;
        } else if (
          sessionId === undefined &&
          isInitializeRequest(requestBody)
        ) {
          // New initialization request
          transport = transportManager.createTransport();

          // Connect the transport to the server
          await server.connect(
            transport as StreamableHTTPServerTransport & { sessionId: string }
          );
        } else {
          loggingContext.log(
            'error',
            'Invalid request: missing session ID or not an initialization request',
            {
              data: { sessionId },
            }
          );
          res.status(400).json({
            error:
              'Invalid request: missing session ID or not an initialization request',
          });
          return;
        }

        await transport.handleRequest(req, res, requestBody);
        return;
      } catch (error) {
        loggingContext.log('error', 'Error handling HTTP request', {
          data: {
            error: {
              message: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined,
            },
          },
        });
        res.status(500).json({ error: 'Internal server error' });
        return;
      }
    })();
  });
}
