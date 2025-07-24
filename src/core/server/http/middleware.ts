import bodyParser from 'body-parser';
import { Application, NextFunction, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';

import { getIPAddress } from '@/utils/ip';
import { logger } from '@/utils/logger';

import { AsyncLocalStorageLoggingContext, loggingContext } from './context';

// MCP Protocol Version constants
const CURRENT_MCP_VERSION = '2025-06-18';
const FALLBACK_MCP_VERSION = '2025-03-26';
const SUPPORTED_MCP_VERSIONS = [CURRENT_MCP_VERSION, FALLBACK_MCP_VERSION];

export function setupMiddleware(app: Application): void {
  app.use(helmet());

  // Rate limit requests globally
  app.use(
    // Refer: https://express-rate-limit.mintlify.app/reference/configuration
    rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 100, // Limit each IP to 100 requests per `windowMs`
      standardHeaders: true,
      legacyHeaders: false,
      // Can use `store` to use a database to store the rate limit data
      skip: (req: Request) => {
        // Skip rate limiting for kube-probe requests
        return req.headers['user-agent']?.includes('kube-probe') ?? false;
      },
    })
  );

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  app.use(
    pinoHttp({
      logger: logger.getLogger(),
      autoLogging: {
        ignore: (req: Request) => {
          return req.headers['user-agent']?.includes('kube-probe') ?? false;
        },
      },
    })
  );

  // MCP Protocol Version Enforcement Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Skip version check for non-MCP endpoints
    if (!req.path.startsWith('/mcp')) {
      next();
      return;
    }

    const protocolVersion = req.headers['mcp-protocol-version'] as string;

    if (!protocolVersion) {
      // For backward compatibility, default to 2025-03-26 if version can't be detected
      loggingContext.log(
        'warn',
        'Missing MCP-Protocol-Version header, defaulting to fallback version',
        {
          data: {
            fallbackVersion: FALLBACK_MCP_VERSION,
            path: req.path,
            method: req.method,
          },
        }
      );
      // Set the fallback version in request context
      req.headers['mcp-protocol-version'] = FALLBACK_MCP_VERSION;
    } else if (!SUPPORTED_MCP_VERSIONS.includes(protocolVersion)) {
      loggingContext.log('error', 'Unsupported MCP protocol version', {
        data: {
          requestedVersion: protocolVersion,
          supportedVersions: SUPPORTED_MCP_VERSIONS,
          path: req.path,
        },
      });
      res.status(400).json({
        error: 'Unsupported MCP protocol version',
        supported_versions: SUPPORTED_MCP_VERSIONS,
        requested_version: protocolVersion,
      });
      return;
    }

    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestStartTime = Date.now();
    const context: AsyncLocalStorageLoggingContext = {
      requestId: (req.headers['x-request-id'] as string) || uuidv4(),
      mcpSessionId: (req.headers['mcp-session-id'] as string) || '',
      mcpProtocolVersion:
        (req.headers['mcp-protocol-version'] as string) || FALLBACK_MCP_VERSION,
      ipAddress: getIPAddress(req),
      userAgent: req.headers['user-agent'] ?? '',
      requestStartTime,
    };

    loggingContext.init(context, () => {
      // clean up on response finish
      res.on('finish', () => {
        const requestDuration = Date.now() - requestStartTime;
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

      // Continue with the next middleware immediately
      next();
    });
  });

  // CORS headers for web clients
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, Authorization'
    );

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });
}
