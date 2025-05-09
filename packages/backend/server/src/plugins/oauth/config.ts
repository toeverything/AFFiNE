import { defineModuleConfig, JSONSchema } from '../../base';

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
declare global {
  interface AppConfigSchema {
    oauth: {
      providers: {
        [OAuthProviderName.Google]: ConfigItem<OAuthProviderConfig>;
        [OAuthProviderName.GitHub]: ConfigItem<OAuthProviderConfig>;
        [OAuthProviderName.OIDC]: ConfigItem<OAuthOIDCProviderConfig>;
      };
    };
  }
}

const schema: JSONSchema = {
  type: 'object',
  properties: {
    clientId: { type: 'string' },
    clientSecret: { type: 'string' },
    args: { type: 'object' },
  },
};

defineModuleConfig('oauth', {
  'providers.google': {
    desc: 'Google OAuth provider config',
    default: {
      clientId: '',
      clientSecret: '',
    },
    schema,
    link: 'https://developers.google.com/identity/protocols/oauth2/web-server',
  },
  'providers.github': {
    desc: 'GitHub OAuth provider config',
    default: {
      clientId: '',
      clientSecret: '',
    },
    schema,
    link: 'https://docs.github.com/en/apps/oauth-apps',
  },
  'providers.oidc': {
    desc: 'OIDC OAuth provider config',
    default: {
      clientId: '',
      clientSecret: '',
      issuer: '',
      args: {},
    },
  },
});
