import { Injectable } from '@nestjs/common';

import { InvalidAuthState } from '../../base';
import { AuthChallengeStore } from './challenge-store';
import type { VerifiedIdentity } from './identity';
import type { CurrentUser } from './session';

@Injectable()
export class OpenAppAuthService {
  constructor(private readonly challenges: AuthChallengeStore) {}

  async createSignInCode(user: CurrentUser) {
    return this.challenges.create(
      'open_app_sign_in',
      { userId: user.id },
      5 * 60 * 1000
    );
  }

  async verifySignInCode(code: string): Promise<VerifiedIdentity> {
    const payload = await this.challenges.consume<{ userId?: string }>(
      'open_app_sign_in',
      code
    );

    if (!payload?.userId) {
      throw new InvalidAuthState();
    }

    return { userId: payload.userId, method: 'open_app' };
  }
}
