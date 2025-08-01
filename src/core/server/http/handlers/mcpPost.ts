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
          (await transportManager.hasTransport(sessionId))
        ) {
          loggingContext.log('debug', 'Found session, getting transport');
          // Reuse existing transport
          const existingTransport =
            await transportManager.getTransport(sessionId);
          if (!existingTransport) {
            loggingContext.log(
              'error',
              'Transport not found despite has() check'
            );
            throw new Error('Transport not found despite has() check');
          }
          loggingContext.log(
            'debug',
            'Transport found, using existing transport'
          );
          transport = existingTransport;
        } else if (
          sessionId === undefined &&
          isInitializeRequest(requestBody)
        ) {
          loggingContext.log('debug', 'No session found, creating new session');
          // New initialization request
          const newSessionId = randomUUID();

          transport = await transportManager.createTransport(newSessionId);
        } else {
          loggingContext.log(
            'error',
            'Invalid request: missing session ID or not an initialization request'
          );
          res.status(400).json({
            error:
              'Invalid request: missing session ID or not an initialization request',
          });
          return;
        }

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
