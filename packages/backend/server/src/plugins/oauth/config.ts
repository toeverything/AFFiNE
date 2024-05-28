import { defineStartupConfig, ModuleConfig } from '../../fundamentals/config';

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  args?: Record<string, string>;
}

export type OIDCArgs = {
  scope?: string;
  claim_id?: string;
  claim_email?: string;
  claim_name?: string;
};

export interface OAuthOIDCProviderConfig extends OAuthProviderConfig {
  issuer: string;
  args?: OIDCArgs;
}

export enum OAuthProviderName {
  Google = 'google',
  GitHub = 'github',
  OIDC = 'oidc',
}

type OAuthProviderConfigMapping = {
  [OAuthProviderName.Google]: OAuthProviderConfig;
  [OAuthProviderName.GitHub]: OAuthProviderConfig;
  [OAuthProviderName.OIDC]: OAuthOIDCProviderConfig;
};

export interface OAuthConfig {
  providers: Partial<OAuthProviderConfigMapping>;
}

declare module '../config' {
  interface PluginsConfig {
    oauth: ModuleConfig<OAuthConfig>;
  }
}

defineStartupConfig('plugins.oauth', {
  providers: {},
});
