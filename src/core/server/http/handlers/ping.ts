import type express from 'express';

import { config } from '@/config/manager';

interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
}

export function setupPingHandler(app: express.Application): void {
  app.get('/ping', (_req, res) => {
    res.send('pong');
    return;
  });

  app.get('/health', (_req, res) => {
    const response: HealthResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: config.server.version,
      environment: config.server.environment,
    };

    res.status(200).json(response);
    return;
  });
}
