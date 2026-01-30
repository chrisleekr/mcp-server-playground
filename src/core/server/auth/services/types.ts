import { z } from 'zod';

export const OAuthServiceAuthorizationServerSchema = z.object({
  issuer: z.string(),
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  registration_endpoint: z.string(),
  response_types_supported: z.array(z.string()),
  grant_types_supported: z.array(z.string()),
  scopes_supported: z.array(z.string()),
  code_challenge_methods_supported: z.array(z.string()),
  token_endpoint_auth_methods_supported: z.array(z.string()),
});

export type OAuthServiceAuthorizationServer = z.infer<
  typeof OAuthServiceAuthorizationServerSchema
>;

export const OAuthServiceProtectedResourceSchema = z.object({
  resource: z.string(),
  authorization_servers: z.array(z.string()),
  scopes_supported: z.array(z.string()),
  bearer_methods_supported: z.array(z.string()),
  dpop_signing_alg_values_supported: z.array(z.string()),
  tls_client_certificate_bound_access_tokens: z.boolean(),
  resource_name: z.string(),
  resource_documentation: z.string(),
});

export type OAuthServiceProtectedResource = z.infer<
  typeof OAuthServiceProtectedResourceSchema
>;

export const OAuthServiceRegisterClientRequestSchema = z.object({
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  redirect_uris: z.array(z.string()),
  response_types: z.array(z.string()).optional(),
  grant_types: z.array(z.string()).optional(),
  application_type: z.enum(['web', 'native']).optional(),
  client_name: z.string().optional(),
  client_uri: z.string().optional(),
  scope: z.string().optional(),
  contacts: z.array(z.string()).optional(),
  tos_uri: z.string().optional(),
  policy_uri: z.string().optional(),
  jwks_uri: z.string().optional(),
  token_endpoint_auth_method: z.string().optional(),
});

export type OAuthServiceRegisterClientRequest = z.infer<
  typeof OAuthServiceRegisterClientRequestSchema
>;

export const OAuthServiceRegisterClientResponseSchema = z.object({
  client_id: z.string(),
  client_secret: z.string().optional(),
  redirect_uris: z.array(z.string()),
  response_types: z.array(z.string()),
  grant_types: z.array(z.string()),
  application_type: z.string(),
  client_name: z.string().optional(),
  client_uri: z.string().optional(),
  scope: z.string().optional(),
  contacts: z.array(z.string()).optional(),
  tos_uri: z.string().optional(),
  policy_uri: z.string().optional(),
  jwks_uri: z.string().optional(),
  token_endpoint_auth_method: z.string(),
  client_id_issued_at: z.number(),
  client_secret_expires_at: z.number().optional(),
});

export type OAuthServiceRegisterClientResponse = z.infer<
  typeof OAuthServiceRegisterClientResponseSchema
>;

export const OAuthServiceHandleAuthorizationRequestSchema = z.object({
  client_id: z.string(),
  redirect_uri: z.string(),
  response_type: z.string(),
  scope: z.string().optional(),
  state: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.enum(['plain', 'S256']).optional(),
});

export type OAuthServiceHandleAuthorizationRequest = z.infer<
  typeof OAuthServiceHandleAuthorizationRequestSchema
>;

export interface OAuthServiceHandleAuthorizationResponse {
  redirectUrl: string;
}

export interface OAuthServiceClient {
  clientId: string;
  clientSecret?: string;
  redirectUris: string[];
  responseTypes: string[];
  grantTypes: string[];
  applicationType: string;
  clientName?: string;
  clientUri?: string;
  scope?: string;
  contacts?: string[];
  tosUri?: string;
  policyUri?: string;
  jwksUri?: string;
  tokenEndpointAuthMethod: string;
  clientIdIssuedAt: number;
  clientSecretExpiresAt?: number;
}

export interface OAuthServiceAuthorizationSession {
  sessionId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  responseType: string;
  createdAt: number;
  expiresAt: number;
}

export interface OAuthServiceAuth0Session {
  sessionId: string;
  state: string;
  codeVerifier: string;
  originalSession: OAuthServiceAuthorizationSession;
  createdAt: number;
  expiresAt: number;
}

export interface OAuthServiceTokenRecord {
  accessToken: string;
  tokenType: string;
  expiresAt: number;
  refreshToken: string;
  scope: string;
  clientId: string;
  userId: string;
  auth0AccessToken: string;
  auth0RefreshToken: string;
  auth0IdToken: string;
  createdAt: number;
}

export const OAuthServiceHandleTokenRequestSchema = z.object({
  grant_type: z.enum(['authorization_code', 'refresh_token']),
  client_id: z.string(),
  client_secret: z.string().optional(),
  code: z.string().optional(),
  redirect_uri: z.string().optional(),
  refresh_token: z.string().optional(),
  code_verifier: z.string().optional(),
  resource: z.string().min(1).optional(),
});

export type OAuthServiceHandleTokenRequest = z.infer<
  typeof OAuthServiceHandleTokenRequestSchema
>;

export const OAuthServiceHandleTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

export type OAuthServiceHandleTokenResponse = z.infer<
  typeof OAuthServiceHandleTokenResponseSchema
>;

export interface JWTServiceAccessTokenArgs {
  clientId: string;
  userId?: string;
  scope?: string;
  audience: string;
  expiresIn: string;
}

export interface JWTServiceRefreshTokenArgs {
  clientId: string;
  userId?: string;
  scope?: string;
  expiresIn: string;
}

/**
 * JWT Claims interface per RFC 7519.
 * The aud claim can be a string or array of strings per Section 4.1.3.
 */
export interface JWTClaims {
  iss: string;
  sub: string;
  /** Audience claim - can be string or array per RFC 7519 Section 4.1.3 */
  aud: string | string[];
  exp: number;
  iat: number;
  type?: string;
  scope?: string;
  client_id: string;
  user_id?: string;
}

export interface OAuthServiceValidateAccessToken {
  valid: boolean;
  claims: JWTClaims | null;
  tokenRecord: OAuthServiceTokenRecord | null;
}

export interface OAuthServiceStats {
  clients: number;
  authSessions: number;
  auth0Sessions: number;
  tokens: number;
}
