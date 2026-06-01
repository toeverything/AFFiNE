import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { ActionForbidden, InvalidAuthState } from '../../base';
import { AuthChallengeStore } from './challenge-store';
import { isNativeClientRequest } from './input';
import { JwtSessionService } from './jwt-session';
import { AuthService } from './service';

interface SessionExchangePayload {
  userId: string;
  sessionId: string;
}

@Injectable()
export class SessionExchangeService {
  constructor(
    private readonly auth: AuthService,
    private readonly challenges: AuthChallengeStore,
    private readonly jwtSession: JwtSessionService
  ) {}

  async createCode(req: Request, userId: string, sessionId: string) {
    if (!isNativeClientRequest(req)) {
      return;
    }

    return this.challenges.create<SessionExchangePayload>(
      'native_session_exchange',
      { userId, sessionId },
      60 * 1000
    );
  }

  async exchange(req: Request, code: string) {
    if (!isNativeClientRequest(req)) {
      throw new ActionForbidden();
    }

    const payload = await this.challenges.consume<SessionExchangePayload>(
      'native_session_exchange',
      code
    );

    if (!payload?.userId || !payload.sessionId) {
      throw new InvalidAuthState();
    }

    const session = await this.auth.getUserSession(
      payload.sessionId,
      payload.userId
    );
    if (!session) {
      throw new InvalidAuthState();
    }

    return this.jwtSession.sign(payload.userId, payload.sessionId);
  }
}
