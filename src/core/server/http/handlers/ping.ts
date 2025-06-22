import express from 'express';

import { loggingContext } from '../context';

export function setupPingHandler(app: express.Application): void {
  app.get('/ping', (_req, res) => {
    loggingContext.log('debug', 'Ping request');
    res.send('pong');
  });
}
