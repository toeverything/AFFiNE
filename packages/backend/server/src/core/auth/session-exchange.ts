import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { Request } from 'express';

import {
  ActionForbidden,
  Cache,
  InvalidAuthState,
  TooManyRequest,
  UserFriendlyError,
} from '../../base';
import { Models } from '../../models';
import { AccessTokenService } from './access-token';
import { AuthSessionErrorCode, AuthSessionService } from './auth-session';
import { AuthChallengeStore } from './challenge-store';
import { isNativeClientRequest } from './input';
import { AuthService } from './service';

interface SessionExchangePayload {
  userId: string;
  clientVersion?: string;
}

export interface AuthSessionMetadata {
  installationId: string;
  platform: 'ios' | 'android' | 'electron';
  deviceName?: string;
  appVersion?: string;
}

export class AuthSessionHttpError extends UserFriendlyError {
  readonly authCode: string;

  constructor(code: string, status = HttpStatus.UNAUTHORIZED) {
    super(
      status === HttpStatus.SERVICE_UNAVAILABLE
        ? 'network_error'
        : 'authentication_required',
      code.toLowerCase() as
        | 'access_token_expired'
        | 'access_token_invalid'
        | 'auth_session_expired'
        | 'auth_session_revoked'
        | 'refresh_token_invalid'
        | 'refresh_token_reused'
        | 'auth_session_temporarily_unavailable'
    );
    this.authCode = code;
    this.status = status;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      code: this.authCode,
    };
  }
}

@Injectable()
export class SessionExchangeService {
  constructor(
    private readonly auth: AuthService,
    private readonly challenges: AuthChallengeStore,
    private readonly cache: Cache,
    private readonly models: Models,
    private readonly accessTokens: AccessTokenService,
    private readonly authSessions: AuthSessionService
  ) {}

  async createCode(req: Request, userId: string, clientVersion?: string) {
    if (!isNativeClientRequest(req)) return;
    return this.challenges.create<SessionExchangePayload>(
      'auth_session_exchange',
      { userId, clientVersion },
      60 * 1000
    );
  }

  @Transactional()
  async exchange(req: Request, code: string, metadata: AuthSessionMetadata) {
    if (!isNativeClientRequest(req)) throw new ActionForbidden();
    const payload = await this.challenges.consume<SessionExchangePayload>(
      'auth_session_exchange',
      code
    );
    if (!payload?.userId) throw new InvalidAuthState();
    const user = await this.models.user.lockForAuthIssuance(payload.userId);
    if (!user || user.disabled) throw new InvalidAuthState();
    const userSession = await this.auth.createUserSession(
      payload.userId,
      undefined,
      undefined,
      payload.clientVersion
    );

    const issued = await this.authSessions.create({
      userSessionId: userSession.id,
      ...metadata,
    });
    return this.tokenPair(
      payload.userId,
      issued.session.id,
      issued.refreshToken,
      issued.refreshExpiresAt,
      issued.session.absoluteExpiresAt
    );
  }

  async refresh(req: Request, refreshToken: string, appVersion?: string) {
    if (!isNativeClientRequest(req)) throw new ActionForbidden();
    const selector = refreshToken.split('.')[1];
    if (selector) {
      const rateKey = `auth:session-refresh-rate:${selector}`;
      const attempts = await this.cache.increaseWithTtl(rateKey, 60_000);
      if (attempts > 30) throw new TooManyRequest();
    }
    const refreshed = await this.authSessions.refresh(refreshToken, appVersion);
    if (refreshed.status !== 'rotated') {
      const status =
        refreshed.code === AuthSessionErrorCode.temporarilyUnavailable
          ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.UNAUTHORIZED;
      throw new AuthSessionHttpError(refreshed.code, status);
    }
    const session = await this.authSessions.get(refreshed.authSessionId);
    if (!session) {
      throw new AuthSessionHttpError(AuthSessionErrorCode.revoked);
    }
    return this.tokenPair(
      session.userSession.userId,
      refreshed.authSessionId,
      refreshed.refreshToken,
      refreshed.refreshExpiresAt,
      session.absoluteExpiresAt
    );
  }

  private async tokenPair(
    userId: string,
    authSessionId: string,
    refreshToken: string,
    refreshTokenExpiresAt: Date,
    absoluteExpiresAt: Date
  ) {
    const access = await this.accessTokens.sign(userId, authSessionId);
    return {
      tokenType: 'Bearer',
      accessToken: access.token,
      expiresIn: this.authSessions.accessTokenTtl,
      refreshToken,
      refreshExpiresAt: refreshTokenExpiresAt,
      session: {
        id: authSessionId,
        absoluteExpiresAt,
      },
    };
  }
}
