import { randomUUID } from 'node:crypto';

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
  transportManager: TransportManager
): void {
  // Handle MCP POST requests (Streamable HTTP)
  app.post('/mcp', requireAuth(), (req, res) => {
    void (async (): Promise<void> => {
      try {
        const requestBody = req.body as unknown;
        const sessionId = getSessionId(req);

        loggingContext.log('debug', 'POST /mcp request body', {
          data: { requestBody },
        });

        let transport: StreamableHTTPServerTransport;

        if (
          sessionId !== undefined &&
          sessionId.trim() !== '' &&
          (await transportManager.hasSession(sessionId))
        ) {
          loggingContext.log('debug', 'Session exists, checking transport', {
            data: { sessionId },
          });
          // If transport exists in this server, then use the existing transport.
          // If transport does not exist in this server, then reply initial request and create a new transport based on the sessionId.
          if (transportManager.hasTransport(sessionId)) {
            loggingContext.log(
              'debug',
              'Found transport in this server, using existing transport'
            );
            // Reuse existing transport
            const existingTransport = transportManager.getTransport(sessionId);
            if (!existingTransport) {
              loggingContext.log(
                'error',
                'Transport not found despite has() check'
              );
              throw new Error('Transport not found despite has() check');
            }
            transport = existingTransport;
          } else {
            loggingContext.log(
              'debug',
              'No transport found in this server, replay initial request'
            );
            // Setup a new transport for the session
            transport = await transportManager.replayInitialRequest(sessionId);
          }
        } else if (
          (sessionId === undefined || sessionId.trim() === '') &&
          isInitializeRequest(requestBody)
        ) {
          loggingContext.log('debug', 'No session found, creating new session');
          // New initialization request
          const newSessionId = randomUUID();

          transport = transportManager.createTransport(newSessionId);

          // Save the initial request to the session
          await transportManager.saveSession(newSessionId, {
            initialRequest: requestBody,
          });

          // Connect the transport to the server
          loggingContext.log('debug', 'Connecting transport to server');
          await transportManager.getServer().connect(transport);
        } else {
          loggingContext.log(
            'error',
            'Invalid request: missing session ID or not an initialization request',
            {
              data: {
                sessionId,
                requestBody,
              },
            }
          );
          res.status(400).json({
            error:
              'Invalid request: missing session ID or not an initialization request',
          });
          return;
        }

        loggingContext.log('debug', 'Handling request', {
          data: {
            sessionId,
            requestBody,
          },
        });
        await transport.handleRequest(req, res, requestBody);
        loggingContext.log('debug', 'Request handled');
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
