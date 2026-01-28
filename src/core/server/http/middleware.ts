import {
  DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';
import bodyParser from 'body-parser';
import {
  type Application,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';

import { config } from '@/config/manager';
import { getIPAddress } from '@/utils/ip';
import { logger } from '@/utils/logger';

import {
  type AsyncLocalStorageLoggingContext,
  loggingContext,
} from './context';

/**
 * Sets up CORS middleware with strict Origin validation for MCP endpoints.
 *
 * Per MCP specification, servers MUST validate the Origin header on all incoming
 * connections to prevent DNS rebinding attacks. Requests from untrusted origins
 * are rejected with 403 Forbidden on MCP endpoints.
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#security-warning
 */
function setupCorsMiddleware(app: Application): void {
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = config.server.http.corsOrigins;
    const isMcpEndpoint = req.path.startsWith('/mcp');

    // Strict Origin validation for MCP endpoints (DNS rebinding protection)
    if (
      isMcpEndpoint &&
      origin !== undefined &&
      !allowedOrigins.includes(origin) &&
      !allowedOrigins.includes('*')
    ) {
      loggingContext.log(
        'warn',
        'Origin validation failed - rejecting request',
        {
          data: { origin, allowedOrigins, path: req.path },
        }
      );
      res.status(403).json({ error: 'Forbidden - Origin not allowed' });
      return;
    }

    // Set CORS headers for allowed origins
    if (allowedOrigins.includes('*')) {
      res.header('Access-Control-Allow-Origin', '*');
    } else if (origin !== undefined && allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }

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

  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

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
      loggingContext.log(
        'warn',
        'Missing MCP-Protocol-Version header, defaulting to fallback version',
        {
          data: {
            fallbackVersion: DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
            path: req.path,
            method: req.method,
          },
        }
      );
      req.headers['mcp-protocol-version'] = DEFAULT_NEGOTIATED_PROTOCOL_VERSION;
    } else if (!SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion)) {
      loggingContext.log('error', 'Unsupported MCP protocol version', {
        data: {
          requestedVersion: protocolVersion,
          supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
          path: req.path,
        },
      });
      res.status(400).json({
        error: 'Unsupported MCP protocol version',
        supported_versions: SUPPORTED_PROTOCOL_VERSIONS,
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
        (req.headers['mcp-protocol-version'] as string) ||
        DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
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
  setupCorsMiddleware(app);
}
