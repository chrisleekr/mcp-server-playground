import express from 'express';

import type { TransportManager } from '@/core/server/transport';

import { loggingContext } from '../context';

export function setupMCPDeleteHandler(
  app: express.Application,
  transportManager: TransportManager
): void {
  // Handle MCP DELETE requests (session termination)
  app.delete('/mcp', (req, res) => {
    void (async (): Promise<void> => {
      try {
        const sessionIdHeader = req.headers['mcp-session-id'];
        const sessionId =
          typeof sessionIdHeader === 'string' ? sessionIdHeader : undefined;

        if (
          sessionId === undefined ||
          sessionId.trim() === '' ||
          !(await transportManager.hasTransport(sessionId))
        ) {
          loggingContext.log('error', 'Session not found');
          res.status(200).json({ error: 'Session not found' }); // Return 200 to gracefully handle the request
          return;
        }

        loggingContext.log('debug', 'Found session, getting transport');
        const transport = await transportManager.getTransport(sessionId);
        if (!transport) {
          loggingContext.log('error', 'Transport not found');
          res.status(200).json({ error: 'Transport not found' }); // Return 200 to gracefully handle the request
          return;
        }
        await transport.handleRequest(req, res);

        // Clean up the transport
        await transportManager.deleteTransport(sessionId);

        loggingContext.log('info', 'Session terminated');
      } catch (error: unknown) {
        loggingContext.log('error', 'Error handling DELETE request', {
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
