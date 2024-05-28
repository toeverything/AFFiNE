import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { Config } from '../../fundamentals';
import { OAuthProviderName } from './config';
import { OAuthProvider } from './providers/def';

const PROVIDERS: Map<OAuthProviderName, OAuthProvider> = new Map();

export function registerOAuthProvider(
  name: OAuthProviderName,
  provider: OAuthProvider
) {
  PROVIDERS.set(name, provider);
}

@Injectable()
export class OAuthProviderFactory {
  get providers() {
    return Array.from(PROVIDERS.keys());
  }

  get(name: OAuthProviderName): OAuthProvider | undefined {
    return PROVIDERS.get(name);
  }
}

export abstract class AutoRegisteredOAuthProvider
  extends OAuthProvider
  implements OnModuleInit
{
  protected abstract AFFiNEConfig: Config;

  get optionalConfig() {
    return this.AFFiNEConfig.plugins.oauth?.providers?.[this.provider];
  }

  get config() {
    const config = this.optionalConfig;

    if (!config) {
      throw new Error(
        `OAuthProvider Config should not be used before registered`
      );
    }

    return config;
  }

  onModuleInit() {
    const config = this.optionalConfig;
    if (config && config.clientId && config.clientSecret) {
      registerOAuthProvider(this.provider, this);
      new Logger(`OAuthProvider:${this.provider}`).log(
        'OAuth provider registered.'
      );
    }
  }
}
