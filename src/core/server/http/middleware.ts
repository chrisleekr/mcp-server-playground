import bodyParser from 'body-parser';
import { Application, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';

import { getIPAddress } from '@/utils/ip';
import { logger } from '@/utils/logger';

import { AsyncLocalStorageLoggingContext, loggingContext } from './context';

export function setupMiddleware(app: Application): void {
  app.use(helmet());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  app.use(
    pinoHttp({
      logger: logger.getLogger(),
    })
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestStartTime = Date.now();
    const context: AsyncLocalStorageLoggingContext = {
      requestId: (req.headers['x-request-id'] as string) || uuidv4(),
      mcpSessionId: (req.headers['mcp-session-id'] as string) || '',
      ipAddress: getIPAddress(req),
      userAgent: req.headers['user-agent'] ?? '',
      requestStartTime,
    };

    loggingContext.init(context, () => {
      // clean up on response finish
      res.on('finish', () => {
        const requestDuration = Date.now() - context.requestStartTime;
        // If the request takes longer than 30 seconds, log a warning
        if (requestDuration > 30000) {
          loggingContext.log(
            'warn',
            `Long-running request detected: ${context.requestId} (${requestDuration}ms)`,
            {
              requestDuration,
            }
          );
        }
      });

      res.on('close', () => {
        // Client disconnected - context will be automatically cleaned up
        if (!res.writableEnded) {
          loggingContext.log(
            'warn',
            'Client disconnected before response completion'
          );
        }
      });

      next();
    });
  });

  // CORS headers for web clients
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Mcp-Session-Id, Last-Event-ID'
    );

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });
}
