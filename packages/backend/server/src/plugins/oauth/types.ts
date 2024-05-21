export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  args: {
    scope?: string;
    claim_id?: string;
    claim_email?: string;
    claim_name?: string;
    promot?: string;
    access_type?: string;
  } & Record<string, string>;
}

export interface OAuthOIDCProviderConfig extends OAuthProviderConfig {
  issuer: string;
}

export enum OAuthProviderName {
  Google = 'google',
  GitHub = 'github',
  OIDC = 'oidc',
}

export interface OAuthConfig {
  enabled: boolean;
  providers: Partial<
    { [key in OAuthProviderName]: OAuthProviderConfig } & {
      oidc: OAuthOIDCProviderConfig;
    }
  >;
}
