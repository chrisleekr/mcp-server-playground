import jwt from 'jsonwebtoken';

import { config } from '@/config/manager';
import { loggingContext } from '@/core/server/http/context';

import {
  JWTClaims,
  JWTServiceAccessTokenArgs,
  JWTServiceRefreshTokenArgs,
} from './types';

export class JWTService {
  private jwtSecret: string;
  constructor() {
    this.jwtSecret = config.server.auth.jwtSecret;

    if (!this.jwtSecret) {
      throw new Error('JWT secret is not set');
    }
  }

  public generateAccessToken(payload: JWTServiceAccessTokenArgs): string {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = payload.expiresIn;

    const claims: JWTClaims = {
      iss: config.server.auth.issuer,
      sub: payload.userId ?? '',
      aud: payload.audience,
      exp: now + parseInt(payload.expiresIn, 10),
      iat: now,
      client_id: payload.clientId,
      scope: payload.scope ?? '',
    };

    try {
      const token = jwt.sign(claims, this.jwtSecret, {
        algorithm: 'HS256',
      });

      loggingContext.log('debug', 'Generated access token', {
        token,
        expiresIn,
        claims,
      });

      return token;
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to generate access token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  public generateRefreshToken(payload: JWTServiceRefreshTokenArgs): string {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = payload.expiresIn;

    const claims: JWTClaims = {
      iss: config.server.auth.issuer,
      sub: payload.userId ?? '',
      exp: now + parseInt(payload.expiresIn, 10),
      iat: now,
      type: 'refresh',
      client_id: payload.clientId,
      aud: config.server.auth.auth0.audience,
      scope: payload.scope ?? '',
    };

    try {
      const token = jwt.sign(claims, this.jwtSecret, {
        algorithm: 'HS256',
      });

      loggingContext.log('debug', 'Generated refresh token', {
        token,
        expiresIn,
        claims,
      });

      return token;
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to generate refresh token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  public verifyAccessToken(token: string): JWTClaims | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
      }) as JWTClaims;

      if (!decoded.client_id) {
        loggingContext.log('warn', 'Invalid token: client_id is required', {
          token,
        });
        return null;
      }

      if (decoded.type === 'refresh') {
        loggingContext.log(
          'warn',
          'Invalid token: refresh token is not allowed',
          {
            token,
          }
        );
        return null;
      }

      return decoded;
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to verify token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  public verifyRefreshToken(token: string): JWTClaims | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
      }) as JWTClaims;

      if (!decoded.client_id) {
        loggingContext.log('warn', 'Invalid token: client_id is required', {
          token,
        });
        return null;
      }

      if (decoded.type !== 'refresh') {
        loggingContext.log('warn', 'Invalid token: not a refresh token', {
          token,
        });
        return null;
      }

      return decoded;
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to verify refresh token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  public getTokenExpiration(token: string): number | null {
    try {
      const decoded = jwt.decode(token) as JWTClaims;
      return decoded.exp;
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to get token expiration', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  public isTokenExpired(token: string): boolean {
    const exp = this.getTokenExpiration(token);
    if (exp === null) {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    return exp < now;
  }
}
