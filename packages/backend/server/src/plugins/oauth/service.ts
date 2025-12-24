import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { SessionCache } from '../../base';
import { OAuthProviderFactory } from './factory';
import { OAuthPkceChallenge, OAuthState } from './types';

const OAUTH_STATE_KEY = 'OAUTH_STATE';

@Injectable()
export class OAuthService {
  constructor(
    private readonly providerFactory: OAuthProviderFactory,
    private readonly cache: SessionCache
  ) {}

  isValidState(stateStr: string) {
    return stateStr.length === 36;
  }

  async saveOAuthState(state: OAuthState) {
    const token = randomUUID();
    const payload: OAuthState = { ...state, token };
    await this.cache.set(`${OAUTH_STATE_KEY}:${token}`, payload, {
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

  createPkcePair(): OAuthPkceChallenge {
    const codeVerifier = this.randomBase64Url(96);
    const hash = createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = this.base64UrlEncode(hash);

    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256',
    };
  }

  private randomBase64Url(byteLength: number) {
    return this.base64UrlEncode(randomBytes(byteLength));
  }

  private base64UrlEncode(buffer: Buffer) {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}
