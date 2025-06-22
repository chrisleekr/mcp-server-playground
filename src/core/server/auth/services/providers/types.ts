export interface Auth0ProviderAuthorizationUrlArgs {
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
}

export interface Auth0ProviderExchangeCodeForTokensArgs {
  code: string;
  redirectUri?: string;
  codeVerifier: string;
}

export interface Auth0ProviderToken {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface Auth0ProviderUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  nickname?: string;
  picture?: string;
  updated_at?: string;
}

export interface Auth0ProviderCallbackParams {
  code: string;
  state: string;
  error: string;
  error_description: string;
}
