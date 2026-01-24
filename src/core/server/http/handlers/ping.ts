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
    const includeDetails = config.server.environment !== 'production';
    const response: HealthResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: includeDetails ? config.server.version : 'redacted',
      environment: includeDetails ? config.server.environment : 'redacted',
    };

    res.status(200).json(response);
    return;
  });
}
