import type express from 'express';

import { type TransportManager } from '../transport';
import { loggingContext } from './context';
import { setupMCPDeleteHandler } from './handlers/mcpDelete';
import { setupMCPPostHandler } from './handlers/mcpPost';
import { setupPingHandler } from './handlers/ping';

export function setupRequestHandlers(
  app: express.Application,
  transportManager: TransportManager
): void {
  app.get('/', (_req, res) => {
    res.send('Hello MCP Server');
    return;
  });

  setupPingHandler(app);
  setupMCPPostHandler(app, transportManager);
  setupMCPDeleteHandler(app, transportManager);

  loggingContext.log('info', 'Request handlers setup complete');
}
