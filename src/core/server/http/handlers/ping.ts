import express from 'express';

export function setupPingHandler(app: express.Application): void {
  app.get('/ping', (_req, res) => {
    res.send('pong');
    return;
  });
}
