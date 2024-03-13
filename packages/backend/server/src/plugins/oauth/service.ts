import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { SessionCache } from '../../fundamentals';
import { OAuthProviderFactory } from './register';
import { OAuthProviderName } from './types';

const OAUTH_STATE_KEY = 'OAUTH_STATE';

interface OAuthState {
  redirectUri: string;
  provider: OAuthProviderName;
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly providerFactory: OAuthProviderFactory,
    private readonly cache: SessionCache
  ) {}

  async saveOAuthState(state: OAuthState) {
    const token = randomUUID();
    await this.cache.set(`${OAUTH_STATE_KEY}:${token}`, state, {
      ttl: 3600 * 3 * 1000 /* 3 hours */,
    });

    return token;
  }

  async getOAuthState(token: string) {
    return this.cache.get<OAuthState>(`${OAUTH_STATE_KEY}:${token}`);
  }

  availableOAuthProviders() {
    return this.providerFactory.providers;
  }
}
