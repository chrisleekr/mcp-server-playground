import axios, { AxiosError } from 'axios';
import { createHash, randomBytes } from 'crypto';
import { Application, Request, Response } from 'express';
import { URL } from 'url';

import { config } from '@/config/manager';
import { Auth0Config } from '@/config/type';
import { loggingContext } from '@/core/server/http/context';

import { StorageService } from '../storageService';
import {
  OAuthServiceAuth0Session,
  OAuthServiceAuthorizationSession,
  OAuthServiceHandleAuthorizationResponse,
  OAuthServiceTokenRecord,
} from '../types';
import {
  Auth0ProviderAuthorizationUrlArgs,
  Auth0ProviderCallbackParams,
  Auth0ProviderExchangeCodeForTokensArgs,
  Auth0ProviderToken,
  Auth0ProviderUserInfo,
} from './types';

export class Auth0Provider {
  private auth0Config: Auth0Config;
  private storageService: StorageService;

  constructor(storageService: StorageService) {
    this.auth0Config = config.server.auth.auth0;
    this.storageService = storageService;
  }

  public generateAuthorizationUrl(
    params: Auth0ProviderAuthorizationUrlArgs
  ): string {
    const url = new URL(`${this.auth0Config.domain}/authorize`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.auth0Config.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('state', params.state);
    url.searchParams.set('scope', params.scope);

    if (this.auth0Config.audience) {
      url.searchParams.set('audience', this.auth0Config.audience);
    }

    if (params.codeChallenge && params.codeChallengeMethod) {
      url.searchParams.set('code_challenge', params.codeChallenge);
      url.searchParams.set('code_challenge_method', params.codeChallengeMethod);
    }

    loggingContext.log('debug', 'Generated Auth0 authorization URL', {
      data: {
        params,
        url: url.toString(),
      },
    });

    return url.toString();
  }

  public async exchangeCodeForTokens(
    params: Auth0ProviderExchangeCodeForTokensArgs
  ): Promise<Auth0ProviderToken> {
    const tokenUrl = `${this.auth0Config.domain}/oauth/token`;

    const requestBody: Record<string, string> = {
      grant_type: 'authorization_code',
      client_id: this.auth0Config.clientId,
      client_secret: this.auth0Config.clientSecret,
      code: params.code,
      // Note: redirect_uri must be OAuth Proxy redirect_uri.
      // redirect_uri: params.redirectUri,
      redirect_uri: `${config.server.auth.baseUrl}/oauth/auth0-callback`,
      code_verifier: params.codeVerifier,
    };

    loggingContext.log('debug', 'Exchanging code for tokens', {
      data: {
        tokenUrl,
        requestBody,
      },
    });

    try {
      const response = await axios.post<Auth0ProviderToken>(
        tokenUrl,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 seconds timeout
        }
      );

      return response.data;
    } catch (error) {
      loggingContext.log('error', 'Failed to exchange code for tokens', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        responseData:
          error instanceof AxiosError ? error.response?.data : undefined,
      });
      throw error;
    }
  }

  public async refreshAccessToken(
    refreshToken: string
  ): Promise<Auth0ProviderToken> {
    const tokenUrl = `${this.auth0Config.domain}/oauth/token`;

    const requestBody: Record<string, string> = {
      grant_type: 'refresh_token',
      client_id: this.auth0Config.clientId,
      client_secret: this.auth0Config.clientSecret,
      refresh_token: refreshToken,
    };

    try {
      const response = await axios.post<Auth0ProviderToken>(
        tokenUrl,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 seconds timeout
        }
      );

      return response.data;
    } catch (error) {
      loggingContext.log('error', 'Failed to refresh access token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        responseData:
          error instanceof AxiosError ? error.response?.data : undefined,
      });
      throw error;
    }
  }

  public async getUserInfo(
    accessToken: string
  ): Promise<Auth0ProviderUserInfo> {
    const userInfoUrl = `${this.auth0Config.domain}/userinfo`;

    try {
      const response = await axios.get<Auth0ProviderUserInfo>(userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.data;
    } catch (error) {
      loggingContext.log('error', 'Failed to get user info', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        responseData:
          error instanceof AxiosError ? error.response?.data : undefined,
      });
      throw error;
    }
  }

  public async validateAccessToken(accessToken: string): Promise<boolean> {
    try {
      await this.getUserInfo(accessToken);
      return true;
    } catch (error) {
      loggingContext.log('error', 'Failed to validate access token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        responseData:
          error instanceof AxiosError ? error.response?.data : undefined,
      });
      return false;
    }
  }

  private async processOAuthServiceTokenRecord(
    authSession: OAuthServiceAuthorizationSession,
    auth0Session: OAuthServiceAuth0Session,
    code: string,
    authorizationCode: string
  ): Promise<void> {
    const auth0Tokens = await this.exchangeCodeForTokens({
      code,
      redirectUri: authSession.redirectUri,
      codeVerifier: auth0Session.codeVerifier,
    });

    loggingContext.log('debug', 'Exchanged code for tokens', {
      data: {
        auth0Tokens,
      },
    });

    const userInfo = await this.getUserInfo(auth0Tokens.access_token);

    loggingContext.log('debug', 'Got user info', {
      data: {
        userInfo,
      },
    });

    // Store the authorization code with Auth0 tokens
    const tokenRecord: OAuthServiceTokenRecord = {
      accessToken: authorizationCode, // Using as temporary access token
      refreshToken: '',
      tokenType: 'Bearer',
      expiresAt: Date.now() + config.server.auth.tokenTTL * 1000,
      scope: authSession.scope,
      clientId: authSession.clientId,
      userId: userInfo.sub,
      auth0AccessToken: auth0Tokens.access_token,
      auth0RefreshToken: auth0Tokens.refresh_token ?? '',
      auth0IdToken: auth0Tokens.id_token ?? '',
      createdAt: Date.now(),
    };

    loggingContext.log('debug', 'Storing token record', {
      data: {
        tokenRecord,
      },
    });

    await this.storageService.storeToken(tokenRecord);

    await this.storageService.deleteAuthSession(authSession.state);
    await this.storageService.deleteAuth0Session(authSession.sessionId);
  }

  private generateAuth0CallbackUrl(
    authSession: OAuthServiceAuthorizationSession,
    authorizationCode: string
  ): string {
    const callbackUrl = new URL(authSession.redirectUri);
    callbackUrl.searchParams.set('code', authorizationCode);

    if (authSession.state) {
      callbackUrl.searchParams.set('state', authSession.state);
    }

    return callbackUrl.toString();
  }

  private async handleAuth0CallbackError(
    authSession: OAuthServiceAuthorizationSession
  ): Promise<void> {
    await this.storageService.deleteAuthSession(authSession.state);
    await this.storageService.deleteAuth0Session(authSession.sessionId);
  }

  public async handleAuth0Callback(
    query: Record<string, string>
  ): Promise<OAuthServiceHandleAuthorizationResponse> {
    loggingContext.log('debug', 'Handling auth0 callback', {
      data: {
        query,
      },
    });

    const { code, state } = this.parseCallbackParams(query);

    const authSession = await this.storageService.getAuthSession(state);

    if (authSession === null) {
      throw new Error('Auth session not found');
    }

    const auth0Session = await this.storageService.getAuth0Session(
      authSession.sessionId
    );

    if (auth0Session === null) {
      throw new Error('Auth0 session not found');
    }

    try {
      const authorizationCode = randomBytes(32).toString('hex');

      await this.processOAuthServiceTokenRecord(
        authSession,
        auth0Session,
        code,
        authorizationCode
      );

      const callbackUrl = this.generateAuth0CallbackUrl(
        authSession,
        authorizationCode
      );

      loggingContext.log('debug', 'Generated callback URL', {
        data: {
          callbackUrl,
        },
      });

      return { redirectUrl: callbackUrl.toString() };
    } catch (error) {
      await this.handleAuth0CallbackError(authSession);

      loggingContext.log('error', 'Failed to handle auth0 callback', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        responseData:
          error instanceof AxiosError ? error.response?.data : undefined,
      });
      throw error;
    }
  }

  private parseCallbackParams(
    params: Record<string, string>
  ): Auth0ProviderCallbackParams {
    const {
      code,
      state,
      error: orgError,
      error_description: orgErrorDescription,
    } = params;

    const error = orgError ?? '';
    const error_description = orgErrorDescription ?? '';

    if (error !== '') {
      throw new Error(error_description);
    }

    if (code === undefined || code === '') {
      throw new Error('Code is required');
    }

    if (state === undefined || state === '') {
      throw new Error('State is required');
    }

    return { code, state, error, error_description };
  }

  /**
   * Generate state parameter for Auth0
   */
  generateState(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Generate code verifier for PKCE
   */
  generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Generate code challenge from verifier for PKCE
   */
  generateCodeChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url');
  }

  public setupHandlers(app: Application): void {
    app.get('/oauth/auth0-callback', async (req: Request, res: Response) => {
      const response = await this.handleAuth0Callback(
        req.query as Record<string, string>
      );
      res.redirect(response.redirectUrl);
    });

    loggingContext.log('info', 'Auth0 handlers setup complete');
  }
}
