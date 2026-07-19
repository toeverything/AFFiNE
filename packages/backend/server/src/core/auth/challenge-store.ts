import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { InvalidAuthState, SessionCache } from '../../base';
import { isValidCacheTtl } from '../../base/cache/provider';

export type AuthChallengePurpose =
  | 'oauth_state'
  | 'open_app_sign_in'
  | 'auth_session_exchange'
  | 'captcha'
  | 'passkey_registration'
  | 'passkey_authentication';

@Injectable()
export class AuthChallengeStore {
  constructor(private readonly cache: SessionCache) {}

  async create<T>(
    purpose: AuthChallengePurpose,
    payload: T | ((token: string) => T),
    ttlMs: number
  ): Promise<string> {
    if (!isValidCacheTtl(ttlMs)) {
      throw new InvalidAuthState();
    }

    const token = randomUUID();
    const value =
      typeof payload === 'function'
        ? (payload as (token: string) => T)(token)
        : payload;
    const stored = await this.cache.set(this.key(purpose, token), value, {
      ttl: ttlMs,
    });
    if (!stored) {
      throw new InvalidAuthState();
    }
    return token;
  }

  async get<T>(purpose: AuthChallengePurpose, token: string) {
    return (await this.cache.get<T>(this.key(purpose, token))) ?? null;
  }

  async consume<T>(purpose: AuthChallengePurpose, token: string) {
    return (await this.cache.getAndDelete<T>(this.key(purpose, token))) ?? null;
  }

  private key(purpose: AuthChallengePurpose, token: string) {
    return `auth_challenge:${purpose}:${token}`;
  }
}
