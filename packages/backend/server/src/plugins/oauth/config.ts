import { z } from 'zod';

import { defineModuleConfig, JSONSchema } from '../../base';

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret?: string;
  args?: Record<string, string>;
}

export type OIDCArgs = {
  scope?: string;
  claim_id?: string;
  claim_email?: string;
  claim_name?: string;
  claim_email_verified?: string;
};

export interface OAuthOIDCProviderConfig extends OAuthProviderConfig {
  issuer: string;
  args?: OIDCArgs;
}

export enum OAuthProviderName {
  Google = 'google',
  GitHub = 'github',
  Apple = 'apple',
  OIDC = 'oidc',
}
declare global {
  interface AppConfigSchema {
    oauth: {
      providers: {
        [OAuthProviderName.Google]: ConfigItem<OAuthProviderConfig>;
        [OAuthProviderName.GitHub]: ConfigItem<OAuthProviderConfig>;
        [OAuthProviderName.Apple]: ConfigItem<OAuthProviderConfig>;
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
    schema,
    link: 'https://openid.net/specs/openid-connect-core-1_0.html',
    shape: z.object({
      issuer: z
        .string()
        .url()
        .regex(/^https?:\/\//, 'issuer must be a valid URL')
        .or(z.string().length(0)),
      args: z.object({
        scope: z.string().optional(),
        claim_id: z.string().optional(),
        claim_email: z.string().optional(),
        claim_name: z.string().optional(),
        claim_email_verified: z.string().optional(),
      }),
    }),
  },
  'providers.apple': {
    desc: 'Apple OAuth provider config',
    default: {
      clientId: '',
      clientSecret: '',
    },
    schema,
    link: 'https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_js/implementing_sign_in_with_apple_in_your_app',
  },
});
