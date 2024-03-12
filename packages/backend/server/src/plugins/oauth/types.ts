export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  args?: Record<string, string>;
}

export enum OAuthProviderName {
  Google = 'google',
  GitHub = 'github',
}

export interface OAuthConfig {
  enabled: boolean;
  providers: Partial<{ [key in OAuthProviderName]: OAuthProviderConfig }>;
}
