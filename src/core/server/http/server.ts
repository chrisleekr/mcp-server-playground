import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express from 'express';

import { setupAuthHandlers } from '../auth';
import { TransportManager } from '../transport';
import { setupRequestHandlers } from './handlers';
import { setupMiddleware } from './middleware';

export function setupHttpServer(server: Server): express.Application {
  const app = express();
  const transportManager = new TransportManager();

  // Setup middleware
  setupMiddleware(app);

  // Setup request handlers
  setupRequestHandlers(app, server, transportManager);

  // Setup auth handlers
  setupAuthHandlers(app);

  return app;
}
