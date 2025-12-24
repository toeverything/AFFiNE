import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  Config,
  InvalidOauthCallbackCode,
  InvalidOauthResponse,
  OnEvent,
} from '../../../base';
import { OAuthProviderName } from '../config';
import { OAuthProviderFactory } from '../factory';
import type { OAuthState } from '../types';

export interface OAuthAccount {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export interface Tokens {
  accessToken: string;
  scope?: string;
  refreshToken?: string;
  expiresAt?: Date;
  idToken?: string;
  tokenType?: string;
}

export interface AuthOptions {
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
}

@Injectable()
export abstract class OAuthProvider {
  abstract provider: OAuthProviderName;
  abstract getAuthUrl(state: string, clientNonce?: string): string;
  abstract getToken(code: string, state: OAuthState): Promise<Tokens>;
  abstract getUser(tokens: Tokens, state: OAuthState): Promise<OAuthAccount>;

  protected readonly logger = new Logger(this.constructor.name);
  @Inject() private readonly factory!: OAuthProviderFactory;
  @Inject() private readonly AFFiNEConfig!: Config;

  get config() {
    return this.AFFiNEConfig.oauth.providers[this.provider];
  }

  get configured() {
    return (
      !!this.config && !!this.config.clientId && !!this.config.clientSecret
    );
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

  get requiresPkce() {
    return false;
  }

  protected async fetchJson<T>(
    url: string,
    init?: RequestInit,
    options?: { treatServerErrorAsInvalid?: boolean }
  ) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', ...init?.headers },
      ...init,
    });

    const body = await response.text();
    if (!response.ok) {
      if (response.status < 500 || options?.treatServerErrorAsInvalid) {
        throw new InvalidOauthCallbackCode({ status: response.status, body });
      }
      throw new Error(
        `Server responded with non-success status ${response.status}, body: ${body}`
      );
    }

    if (!body) {
      return {} as T;
    }

    try {
      return JSON.parse(body) as T;
    } catch {
      throw new InvalidOauthResponse({
        reason: `Unable to parse JSON response from ${url}`,
      });
    }
  }

  protected postFormJson<T>(
    url: string,
    body: string,
    options?: {
      headers?: Record<string, string>;
      treatServerErrorAsInvalid?: boolean;
    }
  ) {
    return this.fetchJson<T>(
      url,
      {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...options?.headers,
        },
      },
      options
    );
  }
}
