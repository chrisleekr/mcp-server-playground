import { config } from '@/config/manager';
import { loggingContext } from '@/core/server/http/context';
import { createStorage } from '@/core/storage/storageFactory';
import { type Storage } from '@/core/storage/types';

import {
  type OAuthServiceAuth0Session,
  type OAuthServiceAuthorizationSession,
  type OAuthServiceClient,
  type OAuthServiceStats,
  type OAuthServiceTokenRecord,
} from './types';

export class StorageService {
  private storage: Storage;

  constructor() {
    try {
      this.storage = createStorage(config.storage);
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to create storage', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  public async registerClient(args: OAuthServiceClient): Promise<void> {
    loggingContext.log('debug', 'Registering client', {
      data: {
        key: `client:${args.clientId}`,
        client: args,
      },
    });

    try {
      await this.storage.set(`client:${args.clientId}`, JSON.stringify(args));
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to register client', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  public async getClient(clientId: string): Promise<OAuthServiceClient | null> {
    loggingContext.log('debug', 'Getting client', {
      data: {
        key: `client:${clientId}`,
      },
    });

    try {
      const client = await this.storage.get(`client:${clientId}`);
      if (client === null) {
        return null;
      }
      return JSON.parse(client) as OAuthServiceClient;
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to get client', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  public async deleteClient(clientId: string): Promise<void> {
    loggingContext.log('debug', 'Deleting client', {
      data: {
        key: `client:${clientId}`,
      },
    });

    try {
      await this.storage.delete(`client:${clientId}`);
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to delete client', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  public async createAuthSession(
    session: OAuthServiceAuthorizationSession
  ): Promise<void> {
    loggingContext.log('debug', 'Creating auth session', {
      data: {
        key: `auth-session:${session.state}`,
        session,
        ttl: config.server.auth.sessionTTL,
      },
    });

    try {
      await this.storage.set(
        `auth-session:${session.state}`, // Use state as the key
        JSON.stringify(session),
        config.server.auth.sessionTTL
      );
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to create auth session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  public async getAuthSession(
    state: string
  ): Promise<OAuthServiceAuthorizationSession | null> {
    loggingContext.log('debug', 'Getting auth session', {
      data: {
        key: `auth-session:${state}`,
      },
    });

    try {
      const session = await this.storage.get(`auth-session:${state}`); // Use state as the key
      if (session === null) {
        loggingContext.log('debug', 'Auth session not found', {
          data: {
            key: `auth-session:${state}`,
          },
        });
        return null;
      }
      const parsedSession = JSON.parse(
        session
      ) as OAuthServiceAuthorizationSession;
      if (parsedSession.expiresAt < Date.now()) {
        loggingContext.log('debug', 'Deleting expired auth session', {
          data: {
            key: `auth-session:${state}`,
          },
        });
        await this.storage.delete(`auth-session:${state}`); // Use state as the key
        return null;
      }
      return parsedSession;
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to get auth session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  public async deleteAuthSession(state: string): Promise<boolean> {
    loggingContext.log('debug', 'Deleting auth session', {
      data: {
        key: `auth-session:${state}`,
      },
    });

    try {
      const deleted = await this.storage.delete(`auth-session:${state}`); // Use state as the key
      return deleted;
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to delete auth session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return false;
    }
  }

  public async createAuth0Session(
    session: OAuthServiceAuth0Session
  ): Promise<void> {
    loggingContext.log('debug', 'Creating auth0 session', {
      data: {
        key: `auth0-session:${session.sessionId}`,
        session,
        ttl: config.server.auth.sessionTTL,
      },
    });

    try {
      await this.storage.set(
        `auth0-session:${session.sessionId}`,
        JSON.stringify(session),
        config.server.auth.sessionTTL
      );
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to create auth0 session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  public async getAuth0Session(
    sessionId: string
  ): Promise<OAuthServiceAuth0Session | null> {
    loggingContext.log('debug', 'Getting auth0 session', {
      data: {
        key: `auth0-session:${sessionId}`,
      },
    });

    try {
      const session = await this.storage.get(`auth0-session:${sessionId}`);
      if (session === null) {
        return null;
      }
      const parsedSession = JSON.parse(session) as OAuthServiceAuth0Session;
      if (parsedSession.expiresAt < Date.now()) {
        loggingContext.log('debug', 'Deleting expired auth0 session', {
          data: {
            key: `auth0-session:${sessionId}`,
          },
        });
        await this.storage.delete(`auth0-session:${sessionId}`);
        return null;
      }
      return parsedSession;
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to get auth0 session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  public async deleteAuth0Session(sessionId: string): Promise<boolean> {
    loggingContext.log('debug', 'Deleting auth0 session', {
      data: {
        key: `auth0-session:${sessionId}`,
      },
    });

    try {
      const deleted = await this.storage.delete(`auth0-session:${sessionId}`);
      return deleted;
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to delete auth0 session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return false;
    }
  }

  public async storeToken(token: OAuthServiceTokenRecord): Promise<void> {
    loggingContext.log('debug', 'Storing token', {
      data: {
        key: `token:${token.accessToken}`,
        token,
        ttl: config.server.auth.tokenTTL,
      },
    });

    try {
      await this.storage.set(
        `token:${token.accessToken}`,
        JSON.stringify(token),
        config.server.auth.tokenTTL
      );

      if (token.refreshToken) {
        await this.storage.set(
          `token:${token.refreshToken}`,
          JSON.stringify(token),
          config.server.auth.refreshTokenTTL
        );
      }
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to store token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  public async getToken(
    accessToken: string
  ): Promise<OAuthServiceTokenRecord | null> {
    loggingContext.log('debug', 'Getting token', {
      data: {
        key: `token:${accessToken}`,
      },
    });

    try {
      const token = await this.storage.get(`token:${accessToken}`);
      if (token === null || token.length === 0) {
        return null;
      }

      const parsedToken = JSON.parse(token) as OAuthServiceTokenRecord;
      if (parsedToken.expiresAt < Date.now()) {
        loggingContext.log('debug', 'Deleting expired token', {
          data: {
            key: `token:${accessToken}`,
          },
        });
        await this.storage.delete(`token:${accessToken}`);

        if (parsedToken.refreshToken) {
          await this.storage.delete(`token:${parsedToken.refreshToken}`);
        }

        return null;
      }
      return parsedToken;
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to get token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  public async getTokenByRefreshToken(
    refreshToken: string
  ): Promise<OAuthServiceTokenRecord | null> {
    loggingContext.log('debug', 'Getting token by refresh token', {
      data: {
        key: `token:${refreshToken}`,
      },
    });

    try {
      const token = await this.storage.get(`token:${refreshToken}`);
      if (token === null || token.length === 0) {
        return null;
      }

      const parsedToken = JSON.parse(token) as OAuthServiceTokenRecord;

      return await this.getToken(parsedToken.accessToken);
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to get token by refresh token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  public async deleteToken(accessToken: string): Promise<boolean> {
    loggingContext.log('debug', 'Deleting token', {
      data: {
        key: `token:${accessToken}`,
      },
    });

    try {
      const deleted = await this.storage.delete(`token:${accessToken}`);

      if (deleted) {
        const token = await this.getToken(accessToken);
        if (token && token.refreshToken !== '') {
          await this.storage.delete(`token:${token.refreshToken}`);
        }
      }

      return deleted;
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to delete token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return false;
    }
  }

  public async deleteTokenByRefreshToken(
    refreshToken: string
  ): Promise<boolean> {
    loggingContext.log('debug', 'Deleting token by refresh token', {
      data: {
        key: `token:${refreshToken}`,
      },
    });

    try {
      const deleted = await this.storage.delete(`token:${refreshToken}`);

      return deleted;
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to delete token by refresh token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return false;
    }
  }

  public async getStats(): Promise<OAuthServiceStats> {
    try {
      const clients = await this.storage.keys('client:*');
      const authSessions = await this.storage.keys('auth-session:*');
      const auth0Sessions = await this.storage.keys('auth0-session:*');
      const tokens = await this.storage.keys('token:*');

      return {
        clients: clients.length,
        authSessions: authSessions.length,
        auth0Sessions: auth0Sessions.length,
        tokens: tokens.length,
      };
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to get stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return { clients: 0, authSessions: 0, auth0Sessions: 0, tokens: 0 };
    }
  }
}
