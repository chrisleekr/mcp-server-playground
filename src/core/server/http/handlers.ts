import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express from 'express';

import { TransportManager } from '../transport';
import { loggingContext } from './context';
import { setupMCPDeleteHandler } from './handlers/mcpDelete';
import { setupMCPPostHandler } from './handlers/mcpPost';
import { setupPingHandler } from './handlers/ping';

export function setupRequestHandlers(
  app: express.Application,
  server: Server,
  transportManager: TransportManager
): void {
  app.get('/', (_req, res) => {
    res.send('Hello MCP Server');
    return;
  });

  setupPingHandler(app);
  setupMCPPostHandler(app, server, transportManager);
  setupMCPDeleteHandler(app, server, transportManager);

  loggingContext.log('info', 'Request handlers setup complete');
}
