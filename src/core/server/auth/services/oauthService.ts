import { randomBytes } from 'crypto';
import { type Application } from 'express';
import { URL } from 'url';

import { config } from '@/config/manager';
import { loggingContext } from '@/core/server/http/context';

import { JWTService } from './jwtService';
import { Auth0Provider } from './providers/auth0';
import { StorageService } from './storageService';
import {
  type OAuthServiceAuth0Session,
  type OAuthServiceAuthorizationServer,
  type OAuthServiceAuthorizationSession,
  type OAuthServiceClient,
  type OAuthServiceHandleAuthorizationRequest,
  OAuthServiceHandleAuthorizationRequestSchema,
  type OAuthServiceHandleAuthorizationResponse,
  type OAuthServiceHandleTokenRequest,
  type OAuthServiceHandleTokenResponse,
  type OAuthServiceProtectedResource,
  type OAuthServiceRegisterClientRequest,
  type OAuthServiceRegisterClientResponse,
  type OAuthServiceStats,
  type OAuthServiceTokenRecord,
  type OAuthServiceValidateAccessToken,
} from './types';

/**
 * OAuth 2.0 service implementing Dynamic Client Registration and token management.
 *
 * This service acts as an OAuth proxy, implementing MCP's required Dynamic Client
 * Registration while delegating actual authentication to Auth0. This approach
 * enables standardized MCP client registration without exposing Auth0's DCR endpoint.
 *
 * OAuth Flow:
 * 1. Client calls POST /oauth/register to get client_id/secret
 * 2. Client initiates authorization via GET /oauth/authorize
 * 3. User is redirected to Auth0 for authentication
 * 4. Auth0 callback exchanges code for tokens
 * 5. Client exchanges authorization code for access/refresh tokens
 *
 * @see {@link https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization}
 */
export class OAuthService {
  private auth0Provider: Auth0Provider;
  private jwtService: JWTService;
  private storageService: StorageService;

  constructor() {
    this.jwtService = new JWTService();
    this.storageService = new StorageService();
    this.auth0Provider = new Auth0Provider(this.storageService);
  }

  /**
   * Normalizes audience URL by removing trailing slashes for consistent comparison.
   * This ensures "http://example.com/" and "http://example.com" are treated as equivalent.
   */
  private normalizeAudience(audience: string): string {
    let normalized = audience;
    while (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }

  /**
   * Checks if a URI is a loopback address (localhost, 127.0.0.1, [::1]).
   * Per RFC 8252 Section 7.3, loopback URIs get special port handling.
   *
   * @see {@link https://www.rfc-editor.org/rfc/rfc8252#section-7.3}
   */
  private isLoopbackURI(uri: string): boolean {
    try {
      const parsed = new URL(uri);
      const host = parsed.hostname.toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    } catch {
      return false;
    }
  }

  /**
   * Matches a redirect URI against registered URIs with RFC 8252 loopback port flexibility.
   *
   * For loopback URIs (localhost, 127.0.0.1, [::1]): matches if scheme, host, and path match
   * (port is ignored per RFC 8252 Section 7.3).
   * For non-loopback URIs: requires exact match per MCP specification.
   *
   * @see {@link https://www.rfc-editor.org/rfc/rfc8252#section-7.3}
   * @see {@link https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization#open-redirection}
   */
  private matchesRedirectURI(
    requestURI: string,
    registeredURIs: string[]
  ): boolean {
    try {
      const requested = new URL(requestURI);

      for (const registered of registeredURIs) {
        const registeredURL = new URL(registered);

        if (this.isLoopbackURI(requestURI) && this.isLoopbackURI(registered)) {
          // RFC 8252: For loopback, match scheme + host + path (ignore port)
          if (
            requested.protocol === registeredURL.protocol &&
            requested.hostname.toLowerCase() ===
              registeredURL.hostname.toLowerCase() &&
            requested.pathname === registeredURL.pathname
          ) {
            return true;
          }
        } else {
          // Non-loopback: exact match required per MCP spec
          if (requestURI === registered) {
            return true;
          }
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Returns OAuth 2.0 Authorization Server Metadata (RFC 8414).
   *
   * Used by clients to discover OAuth endpoints and capabilities.
   * Served at /.well-known/oauth-authorization-server
   */
  public getOAuthAuthorizationServer(): OAuthServiceAuthorizationServer {
    const { baseUrl, issuer } = config.server.auth;

    return {
      issuer,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      scopes_supported: ['openid', 'profile', 'email'],
      code_challenge_methods_supported: ['S256'],
    };
  }

  public getOAuthProtectedResource(): OAuthServiceProtectedResource {
    return {
      resource: config.server.auth.issuer,
      authorization_servers: [config.server.auth.issuer],
      scopes_supported: ['all'],
      bearer_methods_supported: ['header', 'query', 'body'],
      dpop_signing_alg_values_supported: ['RS256'],
      tls_client_certificate_bound_access_tokens: false,
      resource_name: config.server.name,
      resource_documentation: `${config.server.auth.issuer}/docs`,
    };
  }

  /**
   * Implements OAuth 2.0 Dynamic Client Registration (RFC 7591).
   *
   * Generates a unique client_id and client_secret for MCP clients.
   * This enables MCP clients to register without pre-configured credentials.
   *
   * @param args - Client registration request with redirect URIs and metadata
   * @returns Client credentials and registration metadata
   */
  public async registerClient(
    args: OAuthServiceRegisterClientRequest
  ): Promise<OAuthServiceRegisterClientResponse> {
    const clientId = args.client_id ?? `mcp_${randomBytes(16).toString('hex')}`;
    const clientSecret = randomBytes(32).toString('hex');

    const now = Math.floor(Date.now() / 1000);

    const client: OAuthServiceClient = {
      clientId,
      clientIdIssuedAt: now,
      clientSecret,
      applicationType: 'web',
      redirectUris: args.redirect_uris,
      clientName: args.client_name ?? `MCP Client ${clientId}`,
      scope: args.scope ?? config.server.auth.auth0.scope,
      grantTypes: args.grant_types ?? ['authorization_code'],
      responseTypes: args.response_types ?? ['code'],
      tokenEndpointAuthMethod:
        args.token_endpoint_auth_method ?? 'client_secret_post',
    };

    await this.storageService.registerClient(client);

    const response: OAuthServiceRegisterClientResponse = {
      application_type: client.applicationType,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uris: client.redirectUris,
      client_name: client.clientName,
      scope: client.scope,
      grant_types: client.grantTypes,
      response_types: client.responseTypes,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      client_id_issued_at: client.clientIdIssuedAt,
      client_secret_expires_at: client.clientSecretExpiresAt ?? 0,
    };

    return response;
  }

  private async getClientOrRegister(
    args: OAuthServiceHandleAuthorizationRequest
  ): Promise<OAuthServiceClient | null> {
    let client = await this.storageService.getClient(args.client_id);
    if (!client) {
      // Auto-register new client with the provided redirect_uri (valid DCR per RFC 7591)
      const registerClientResponse = await this.registerClient({
        client_id: args.client_id,
        client_secret: '',
        redirect_uris: [args.redirect_uri],
        response_types: ['code'],
        grant_types: ['authorization_code'],
        application_type: 'web',
        client_name: `MCP Client ${args.client_id}`,
        client_uri: '',
        scope: config.server.auth.auth0.scope,
        contacts: [],
        tos_uri: '',
        policy_uri: '',
        jwks_uri: '',
        token_endpoint_auth_method: 'client_secret_post',
      });

      client = await this.storageService.getClient(
        registerClientResponse.client_id
      );
    }
    // Redirect URI validation happens in validateAuthorizationClient
    // with RFC 8252 loopback port flexibility

    return client;
  }

  private validateAuthorizationClient(
    args: OAuthServiceHandleAuthorizationRequest,
    client: OAuthServiceClient | null
  ): void {
    if (
      client &&
      !this.matchesRedirectURI(args.redirect_uri, client.redirectUris)
    ) {
      loggingContext.log('warn', 'Redirect URI validation failed', {
        data: {
          clientId: client.clientId,
          requestedURI: args.redirect_uri,
          registeredURIs: client.redirectUris,
          isLoopback: this.isLoopbackURI(args.redirect_uri),
        },
      });
      throw new Error('Redirect URI not found');
    }

    if (client && !client.responseTypes.includes('code')) {
      throw new Error('Response type not supported');
    }
  }

  private validateAuthorization(
    args: OAuthServiceHandleAuthorizationRequest
  ): void {
    const validationResult =
      OAuthServiceHandleAuthorizationRequestSchema.safeParse(args);

    if (!validationResult.success) {
      loggingContext.log('error', 'Invalid authorization request', {
        data: {
          args,
        },
      });
      throw new Error('Invalid authorization request');
    }
  }

  /**
   * Initiates the OAuth 2.0 authorization flow.
   *
   * Creates an authorization session, generates PKCE challenge, and returns
   * a redirect URL to Auth0 for user authentication.
   *
   * @param args - Authorization request with client_id, redirect_uri, scope, etc.
   * @returns Redirect URL to the Auth0 authorization endpoint
   * @throws {Error} If client validation fails or request is invalid
   */
  public async handleAuthorization(
    args: OAuthServiceHandleAuthorizationRequest
  ): Promise<OAuthServiceHandleAuthorizationResponse> {
    loggingContext.log('debug', 'Handling authorization', {
      data: {
        args,
      },
    });

    this.validateAuthorization(args);

    const client = await this.getClientOrRegister(args);

    if (!client) {
      throw new Error('Client not found or registered');
    }

    this.validateAuthorizationClient(args, client);

    const sessionId = randomBytes(32).toString('hex');
    const codeVerifier = this.auth0Provider.generateCodeVerifier();
    const codeChallenge =
      this.auth0Provider.generateCodeChallenge(codeVerifier);
    const state = this.auth0Provider.generateState();

    const authSession: OAuthServiceAuthorizationSession = {
      sessionId,
      clientId: client.clientId,
      // Note: redirectUri must be request's redirect_uri.
      redirectUri: args.redirect_uri,
      // redirectUri: `http://${config.server.http.host}:${config.server.http.port}/oauth/auth0-callback`,
      scope: args.scope ?? 'openid profile email',
      state,
      codeChallenge,
      codeChallengeMethod: args.code_challenge_method ?? 'S256',
      expiresAt: Date.now() + config.server.auth.sessionTTL * 1000,
      responseType: args.response_type,
      createdAt: Math.floor(Date.now() / 1000),
    };

    const auth0Session: OAuthServiceAuth0Session = {
      sessionId,
      state,
      codeVerifier,
      originalSession: authSession,
      createdAt: Date.now(),
      expiresAt: Date.now() + config.server.auth.sessionTTL * 1000,
    };

    await this.storageService.createAuthSession(authSession);
    await this.storageService.createAuth0Session(auth0Session);

    // Note: Currently, only Auth0 is supported
    // if (config.server.auth.provider !== 'auth0') {
    //   throw new Error('Provider not supported');
    // }
    const redirectUrl = this.auth0Provider.generateAuthorizationUrl({
      redirectUri: `${config.server.auth.baseUrl}/oauth/auth0-callback`,
      // redirectUri: args.redirect_uri,
      state,
      codeChallenge,
      codeChallengeMethod: authSession.codeChallengeMethod,
      scope: args.scope ?? 'openid profile email',
    });

    return { redirectUrl };
  }

  /**
   * Handles OAuth 2.0 token requests (authorization_code and refresh_token grants).
   *
   * For authorization_code: Exchanges the code for access and refresh tokens.
   * For refresh_token: Issues a new access token using the refresh token.
   *
   * @param args - Token request with grant_type, code/refresh_token, and client credentials
   * @returns Access token, refresh token, and token metadata
   * @throws {Error} If client validation fails or token/code is invalid
   */
  public async handleTokenRequest(
    args: OAuthServiceHandleTokenRequest
  ): Promise<OAuthServiceHandleTokenResponse> {
    loggingContext.log('debug', 'Handling token request', {
      data: {
        grant_type: args.grant_type,
        client_id: args.client_id,
      },
    });

    switch (args.grant_type) {
      case 'authorization_code':
        return this.handleAuthorizationCodeGrant(args);
      case 'refresh_token':
        return this.handleRefreshTokenGrant(args);
      default: {
        const exhaustiveCheck: never = args.grant_type;
        throw new Error(`Unsupported grant_type: ${exhaustiveCheck as string}`);
      }
    }
  }

  private validateAuthorizationCodeClientSecret(
    args: OAuthServiceHandleTokenRequest,
    client: OAuthServiceClient | null
  ): void {
    // Note: For PKCE flows, client secret validation should be optional because `code_verifier` is used instead.
    if (client && client.clientSecret !== args.client_secret) {
      if (args.code_verifier !== undefined && args.code_verifier !== '') {
        loggingContext.log(
          'error',
          'Client secret validation failed, it is optional for PKCE flows',
          {
            data: {
              client_id: args.client_id,
            },
          }
        );
      } else {
        throw new Error('Invalid client secret for authorization code grant');
      }
    }
  }

  private validateAuthorizationCodeToken(
    tokenRecord: OAuthServiceTokenRecord | null,
    args: OAuthServiceHandleTokenRequest
  ): void {
    if (tokenRecord && tokenRecord.clientId !== args.client_id) {
      throw new Error('Client mismatch');
    }
  }

  private generateAccessAndRefreshTokens(
    tokenRecord: OAuthServiceTokenRecord,
    args: OAuthServiceHandleTokenRequest
  ): {
    accessToken: string;
    refreshToken: string;
  } {
    // Use the resource parameter if provided (RFC 8707 Resource Indicators)
    // Normalize to remove trailing slashes for consistent audience matching
    const audience = this.normalizeAudience(
      args.resource ?? config.server.auth.auth0.audience
    );

    const accessToken = this.jwtService.generateAccessToken({
      clientId: args.client_id,
      userId: tokenRecord.userId,
      scope: tokenRecord.scope,
      audience,
      expiresIn: config.server.auth.tokenTTL.toString(),
    });

    const refreshToken = this.jwtService.generateRefreshToken({
      clientId: args.client_id,
      userId: tokenRecord.userId,
      scope: tokenRecord.scope,
      expiresIn: config.server.auth.refreshTokenTTL.toString(),
    });

    return { accessToken, refreshToken };
  }

  private async storeAuthorizationCodeGrantToken(
    accessToken: string,
    refreshToken: string,
    tokenRecord: OAuthServiceTokenRecord,
    args: OAuthServiceHandleTokenRequest
  ): Promise<OAuthServiceTokenRecord> {
    loggingContext.log('debug', 'Storing authorization code grant token', {
      data: {
        clientId: args.client_id,
        userId: tokenRecord.userId,
        scope: tokenRecord.scope,
      },
    });
    const newTokenRecord: OAuthServiceTokenRecord = {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresAt: Date.now() + config.server.auth.tokenTTL * 1000,
      scope: tokenRecord.scope,
      clientId: args.client_id,
      userId: tokenRecord.userId,
      auth0AccessToken: tokenRecord.auth0AccessToken,
      auth0RefreshToken: tokenRecord.auth0RefreshToken,
      auth0IdToken: tokenRecord.auth0IdToken,
      createdAt: Date.now(),
    };

    try {
      await this.storageService.storeToken(newTokenRecord);
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to store token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }

    return newTokenRecord;
  }

  private async deleteAuthorizationCodeGrantToken(code: string): Promise<void> {
    try {
      await this.storageService.deleteToken(code);
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to delete token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  private async handleAuthorizationCodeGrant(
    args: OAuthServiceHandleTokenRequest
  ): Promise<OAuthServiceHandleTokenResponse> {
    const client = await this.storageService.getClient(args.client_id);

    if (!client) {
      throw new Error('Client not found for authorization code grant');
    }

    this.validateAuthorizationCodeClientSecret(args, client);

    if (args.code === undefined || args.code === '') {
      throw new Error('Code is required');
    }

    const tokenRecord = await this.storageService.getToken(args.code);

    if (!tokenRecord) {
      throw new Error('Token not found');
    }

    this.validateAuthorizationCodeToken(tokenRecord, args);

    const { accessToken, refreshToken } = this.generateAccessAndRefreshTokens(
      tokenRecord,
      args
    );

    const newTokenRecord = await this.storeAuthorizationCodeGrantToken(
      accessToken,
      refreshToken,
      tokenRecord,
      args
    );

    await this.deleteAuthorizationCodeGrantToken(args.code);

    return {
      access_token: newTokenRecord.accessToken,
      token_type: newTokenRecord.tokenType,
      expires_in: config.server.auth.tokenTTL,
      refresh_token: newTokenRecord.refreshToken,
      scope: newTokenRecord.scope,
    };
  }

  private async handleRefreshTokenGrant(
    args: OAuthServiceHandleTokenRequest
  ): Promise<OAuthServiceHandleTokenResponse> {
    const client = await this.storageService.getClient(args.client_id);

    if (!client) {
      throw new Error('Client not found for refresh token grant');
    }

    if (client.clientSecret !== args.client_secret) {
      throw new Error('Invalid client secret for refresh token grant');
    }

    if (args.refresh_token === undefined || args.refresh_token === '') {
      throw new Error('Refresh token is required');
    }

    const tokenRecord = await this.storageService.getTokenByRefreshToken(
      args.refresh_token
    );

    if (!tokenRecord) {
      throw new Error('Token not found');
    }

    if (tokenRecord.clientId !== args.client_id) {
      throw new Error('Client mismatch');
    }

    // Use the resource parameter if provided (RFC 8707 Resource Indicators)
    // Normalize to remove trailing slashes for consistent audience matching
    const audience = this.normalizeAudience(
      args.resource ?? config.server.auth.auth0.audience
    );

    const accessToken = this.jwtService.generateAccessToken({
      clientId: args.client_id,
      userId: tokenRecord.userId,
      scope: tokenRecord.scope,
      audience,
      expiresIn: config.server.auth.tokenTTL.toString(),
    });

    const newTokenRecord: OAuthServiceTokenRecord = {
      ...tokenRecord,
      accessToken,
      refreshToken: tokenRecord.refreshToken,
      tokenType: 'Bearer',
      expiresAt: Date.now() + config.server.auth.tokenTTL * 1000,
    };

    try {
      await this.storageService.storeToken(newTokenRecord);
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to store token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }

    const response: OAuthServiceHandleTokenResponse = {
      access_token: newTokenRecord.accessToken,
      token_type: newTokenRecord.tokenType,
      expires_in: config.server.auth.tokenTTL,
      refresh_token: newTokenRecord.refreshToken,
      scope: newTokenRecord.scope,
    };

    return response;
  }

  /**
   * Validates an access token and returns associated claims.
   *
   * Verifies JWT signature, expiration, and checks token exists in storage.
   * Used by the authentication middleware to protect MCP endpoints.
   *
   * @param token - The access token to validate
   * @param expectedAudience - Optional audience claim to validate (RFC 8707)
   * @returns Validation result with claims and token record if valid
   */
  public async validateAccessToken(
    token: string,
    expectedAudience?: string
  ): Promise<OAuthServiceValidateAccessToken> {
    loggingContext.log('debug', 'Validating access token', {
      data: {
        expectedAudience,
        hasToken: token.length > 0,
      },
    });

    try {
      const claims = this.jwtService.verifyAccessToken(token);

      if (!claims) {
        loggingContext.log('debug', 'Invalid access token', {
          data: {
            valid: false,
          },
        });
        return { valid: false, claims: null, tokenRecord: null };
      }

      // Validate audience if provided (RFC 8707 Resource Indicators)
      // Per RFC 7519 Section 4.1.3, aud can be a string or array of strings
      // Normalize URLs to handle trailing slash differences
      if (expectedAudience !== undefined) {
        const normalizedExpected = this.normalizeAudience(expectedAudience);
        const audArray = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
        const normalizedAudArray = audArray
          .filter((aud): aud is string => typeof aud === 'string' && aud !== '')
          .map(aud => this.normalizeAudience(aud));
        if (
          normalizedAudArray.length === 0 ||
          !normalizedAudArray.includes(normalizedExpected)
        ) {
          loggingContext.log('warn', 'Token audience validation failed', {
            data: {
              expectedAudience: normalizedExpected,
              actualAudience: normalizedAudArray,
              clientId: claims.client_id,
            },
          });
          return { valid: false, claims: null, tokenRecord: null };
        }
      }

      const tokenRecord = await this.storageService.getToken(token);

      if (!tokenRecord) {
        loggingContext.log('debug', 'Token record not found', {
          data: {
            token,
            valid: false,
            claims,
            tokenRecord,
          },
        });
        return { valid: false, claims: null, tokenRecord: null };
      }

      const client = await this.storageService.getClient(claims.client_id);

      if (!client) {
        loggingContext.log('debug', 'Client not found', {
          data: {
            client,
            valid: false,
            claims,
            tokenRecord,
          },
        });
        return { valid: false, claims: null, tokenRecord: null };
      }

      loggingContext.log('debug', 'Access token is valid', {
        data: {
          valid: true,
          claims,
          tokenRecord,
        },
      });

      return { valid: true, claims, tokenRecord };
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to validate access token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return { valid: false, claims: null, tokenRecord: null };
    }
  }

  /**
   * Revokes an access or refresh token (RFC 7009).
   *
   * Removes the token from storage, preventing further use.
   * Accepts either access tokens or refresh tokens.
   *
   * @param token - The token to revoke
   * @returns True if token was found and revoked, false otherwise
   */
  public async revokeToken(token: string): Promise<boolean> {
    try {
      if (await this.storageService.deleteToken(token)) {
        return true;
      }

      if (await this.storageService.deleteTokenByRefreshToken(token)) {
        return true;
      }

      return false;
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to revoke token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return false;
    }
  }

  public async getStats(): Promise<OAuthServiceStats> {
    return this.storageService.getStats();
  }

  public setupHandlers(app: Application): void {
    this.auth0Provider.setupHandlers(app);
  }
}
