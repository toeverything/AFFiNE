import serverNativeModule from '@affine/server-native';

import { defineNativeModuleConfig } from '../../base';

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
  allowPrivateNetwork?: boolean;
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

defineNativeModuleConfig(
  'oauth',
  serverNativeModule.appConfigDescriptors('oauth'),
  serverNativeModule.validateAppConfigValue
);
