import {
  type Application,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import { config } from '@/config/manager';
import { loggingContext } from '@/core/server/http/context';

import { OAuthService } from './services/oauthService';
import {
  type OAuthServiceAuthorizationServer,
  type OAuthServiceHandleAuthorizationRequest,
  type OAuthServiceHandleTokenRequest,
  type OAuthServiceProtectedResource,
  type OAuthServiceRegisterClientRequest,
} from './services/types';

const oauthService = new OAuthService();

function parseBearerToken(req: Request): string {
  const authHeader = req.headers.authorization ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    loggingContext.log('warn', 'Invalid authorization header format');
    return '';
  }

  return authHeader.substring(7); // Remove "Bearer " prefix
}

export function requireAuth(): (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (config.server.auth.enabled === false) {
      loggingContext.log('warn', 'Auth is disabled, skipping auth routes');
      next();
      return;
    }
    const token = parseBearerToken(req);

    if (token.length === 0) {
      loggingContext.log('warn', 'No token provided');
      res.status(401).json({ error: 'Unauthorized - No token provided' });
      return;
    }
    try {
      // Use the server issuer as the expected audience for MCP endpoints
      const expectedAudience = config.server.auth.issuer;
      const result = await oauthService.validateAccessToken(
        token,
        expectedAudience
      );
      if (!result.valid) {
        loggingContext.log('warn', 'Invalid token provided');
        res.status(401).json({ error: 'Unauthorized - Invalid token' });
        return;
      }

      loggingContext.log('debug', 'Token validated successfully');
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to validate token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(401).json({
        error: 'Unauthorized - Failed to validate token',
      });
      return;
    }

    next();
  };
}

export function setupAuthHandlers(app: Application): void {
  if (config.server.auth.enabled !== true) {
    loggingContext.log('warn', 'Auth is disabled, skipping auth routes');
    return;
  }

  app.get(
    '/.well-known/oauth-authorization-server',
    (_req: Request, res: Response) => {
      const metadata: OAuthServiceAuthorizationServer =
        oauthService.getOAuthAuthorizationServer();

      res.setHeader('Content-Type', 'application/json');
      res.status(200).json(metadata);
      return;
    }
  );

  app.get(
    '/.well-known/oauth-protected-resource',
    (_req: Request, res: Response) => {
      const metadata: OAuthServiceProtectedResource =
        oauthService.getOAuthProtectedResource();

      res.setHeader('Content-Type', 'application/json');
      res.status(200).json(metadata);
      return;
    }
  );

  app.post('/oauth/register', async (req: Request, res: Response) => {
    const request = req.body as OAuthServiceRegisterClientRequest;
    const response = await oauthService.registerClient(request);

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(response);
    return;
  });

  app.get('/oauth/authorize', async (req: Request, res: Response) => {
    const request = req.query as OAuthServiceHandleAuthorizationRequest;

    const response = await oauthService.handleAuthorization(request);

    res.redirect(response.redirectUrl);
    return;
  });

  app.post('/oauth/token', async (req: Request, res: Response) => {
    const request = req.body as OAuthServiceHandleTokenRequest;
    const response = await oauthService.handleTokenRequest(request);

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(response);
    return;
  });

  app.post('/oauth/revoke', async (req: Request, res: Response) => {
    const token = req.body as string;
    const response = await oauthService.revokeToken(token);

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(response);
    return;
  });

  app.get('/oauth/stats', async (_req: Request, res: Response) => {
    const response = await oauthService.getStats();
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(response);
    return;
  });

  oauthService.setupHandlers(app);

  loggingContext.log('info', 'Auth handlers setup complete');
}
