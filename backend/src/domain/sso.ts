export interface OauthAccount {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
}

export type OauthProviderName = 'OIDC' | 'Google' | 'GitHub' | 'Apple';

export interface SsoProfile {
  provider: string;
  providerAccountId: string;
  email: string;
  name: string;
}

export interface OidcAuthorizationInput {
  state: string;
  nonce: string;
  redirectUri: string;
}

export interface OidcClient {
  enabled: boolean;
  providerLabel: OauthProviderName;
  authorizationUrl(input: OidcAuthorizationInput): string | Promise<string>;
  exchangeCode(input: {
    code: string;
    redirectUri: string;
    nonce?: string;
  }): Promise<SsoProfile>;
}
