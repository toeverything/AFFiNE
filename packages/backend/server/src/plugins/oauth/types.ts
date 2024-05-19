export interface OAuthProviderConfig {
  issuer?: string;
  clientId: string;
  clientSecret: string;
  args?: Record<string, string>;
}

export enum OAuthProviderName {
  Google = 'google',
  GitHub = 'github',
  OIDC = 'oidc',  
}

export interface OAuthConfig {
  enabled: boolean;
  providers: Partial<{ [key in OAuthProviderName]: OAuthProviderConfig }>;
}
