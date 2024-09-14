import { AIProvider } from '@affine/core/blocksuite/presets/ai';
import { Service } from '@toeverything/infra';
import { distinctUntilChanged, map, skip } from 'rxjs';

import { type AuthAccountInfo } from '../entities/session';
import type { AuthService } from './auth';
function toAIUserInfo(account: AuthAccountInfo | null) {
  if (!account) return null;
  return {
    avatarUrl: account.avatar ?? '',
    email: account.email ?? '',
    id: account.id,
    name: account.label,
  };
}

export class AIService extends Service {
  constructor(private readonly auth: AuthService) {
    super();

    AIProvider.provide('userInfo', () => {
      return toAIUserInfo(this.auth.session.account$.value);
    });

    this.auth.session.account$
      .pipe(
        map(a => ({
          id: a?.id,
          account: a,
        })),
        distinctUntilChanged((a, b) => a.id === b.id), // only emit when the value changes
        skip(1) // skip the initial value
      )
      .subscribe(({ account }) => {
        AIProvider.slots.userInfo.emit(toAIUserInfo(account));
      });
  }
}
