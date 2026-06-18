import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

import { getClientVersionFromRequest, getRequestCookie } from '../../base';
import type { VerifiedIdentity } from './identity';
import { isNativeClientRequest } from './input';
import { SessionExchangeService } from './native-exchange';
import { AuthService } from './service';

export type IssuedSession = {
  userId: string;
  sessionId: string;
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
    const sessionId =
      req.authType === 'jwt'
        ? req.session?.sessionId
        : getRequestCookie(req, AuthService.sessionCookieName);
    const signInClientVersion =
      identity.clientVersion ?? getClientVersionFromRequest(req);
    const userSession = await this.auth.createUserSession(
      identity.userId,
      sessionId,
      undefined,
      signInClientVersion
    );

    if (nativeClient) {
      this.auth.clearCookies(res);
    } else {
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
    }

    const exchangeCode = await this.sessionExchange.createCode(
      req,
      identity.userId,
      userSession.sessionId
    );

    return {
      userId: identity.userId,
      sessionId: userSession.sessionId,
      exchangeCode,
    };
  }
}
