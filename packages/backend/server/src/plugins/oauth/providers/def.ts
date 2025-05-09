import { Inject, Injectable, Logger } from '@nestjs/common';

import { Config, OnEvent } from '../../../base';
import { OAuthProviderName } from '../config';
import { OAuthProviderFactory } from '../factory';

export interface OAuthAccount {
  id: string;
  email: string;
  avatarUrl?: string;
}

export interface Tokens {
  accessToken: string;
  scope?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

@Injectable()
export abstract class OAuthProvider {
  abstract provider: OAuthProviderName;
  abstract getAuthUrl(state: string): string;
  abstract getToken(code: string): Promise<Tokens>;
  abstract getUser(token: string): Promise<OAuthAccount>;

  protected readonly logger = new Logger(this.constructor.name);
  @Inject() private readonly factory!: OAuthProviderFactory;
  @Inject() private readonly AFFiNEConfig!: Config;

  get config() {
    return this.AFFiNEConfig.oauth.providers[this.provider];
  }

  get configured() {
    return this.config && this.config.clientId && this.config.clientSecret;
  }

  @OnEvent('config.init')
  onConfigInit() {
    this.setup();
  }

  @OnEvent('config.changed')
  onConfigUpdated(event: Events['config.changed']) {
    if ('oauth' in event.updates) {
      this.setup();
    }
  }

  protected setup() {
    if (this.configured) {
      this.factory.register(this);
    } else {
      this.factory.unregister(this);
    }
  }
}
