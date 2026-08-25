import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

import { getClientVersionFromRequest, getRequestCookie } from '../../base';
import type { VerifiedIdentity } from './identity';
import { isNativeClientRequest } from './input';
import { AuthService } from './service';
import { SessionExchangeService } from './session-exchange';

export type IssuedSession = {
  userId: string;
  sessionId?: string;
  exchangeCode?: string;
};

@Injectable()
export class SessionIssuer {
  constructor(
    private readonly auth: AuthService,
    private readonly sessionExchange: SessionExchangeService
  ) {}

  async issue(
    req: Request,
    res: Response,
    identity: VerifiedIdentity
  ): Promise<IssuedSession> {
    const nativeClient = isNativeClientRequest(req);
    const signInClientVersion =
      identity.clientVersion ?? getClientVersionFromRequest(req);
    if (nativeClient) {
      this.auth.clearCookies(res);
      return {
        userId: identity.userId,
        exchangeCode: await this.sessionExchange.createCode(
          req,
          identity.userId,
          signInClientVersion
        ),
      };
    }

    const sessionId =
      req.authType === 'jwt'
        ? req.session?.sessionId
        : getRequestCookie(req, AuthService.sessionCookieName);
    const userSession = await this.auth.createUserSession(
      identity.userId,
      sessionId,
      undefined,
      signInClientVersion
    );

    res.cookie(AuthService.sessionCookieName, userSession.sessionId, {
      ...this.auth.cookieOptions,
      expires: userSession.expiresAt ?? void 0,
    });

    res.cookie(AuthService.csrfCookieName, randomUUID(), {
      ...this.auth.cookieOptions,
      httpOnly: false,
      expires: userSession.expiresAt ?? void 0,
    });

    this.auth.setUserCookie(res, identity.userId);

    return {
      userId: identity.userId,
      sessionId: userSession.sessionId,
    };
  }
}
