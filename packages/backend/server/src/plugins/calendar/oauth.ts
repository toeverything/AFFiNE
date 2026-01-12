import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { SessionCache } from '../../base';
import { CalendarProviderName } from './providers';

export interface CalendarOAuthState {
  provider: CalendarProviderName;
  userId: string;
  redirectUri?: string;
  token?: string;
}

const CALENDAR_OAUTH_STATE_KEY = 'CALENDAR_OAUTH_STATE';

@Injectable()
export class CalendarOAuthService {
  constructor(private readonly cache: SessionCache) {}

  isValidState(stateStr: string) {
    return stateStr.length === 36;
  }

  async saveOAuthState(state: CalendarOAuthState) {
    const token = randomUUID();
    const payload: CalendarOAuthState = { ...state, token };
    await this.cache.set(`${CALENDAR_OAUTH_STATE_KEY}:${token}`, payload, {
      ttl: 3600 * 3 * 1000,
    });
    return token;
  }

  async getOAuthState(token: string) {
    return this.cache.get<CalendarOAuthState>(
      `${CALENDAR_OAUTH_STATE_KEY}:${token}`
    );
  }
}
