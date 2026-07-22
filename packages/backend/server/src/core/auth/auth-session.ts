import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';

import {
  Cache,
  Config,
  CryptoHelper,
  EventBus,
  metrics,
  OnEvent,
} from '../../base';
import { Models } from '../../models';
import {
  createAuthSessionRefreshToken,
  parseAuthSessionRefreshToken,
} from '../../native';

export const AuthSessionErrorCode = {
  invalid: 'REFRESH_TOKEN_INVALID',
  expired: 'AUTH_SESSION_EXPIRED',
  revoked: 'AUTH_SESSION_REVOKED',
  reused: 'REFRESH_TOKEN_REUSED',
  temporarilyUnavailable: 'AUTH_SESSION_TEMPORARILY_UNAVAILABLE',
} as const;

declare global {
  interface Events {
    'auth.session.created': {
      authSessionId: string;
      platform: string;
    };
    'auth.session.refreshed': {
      authSessionId: string;
    };
    'auth.session.revoked': {
      authSessionId: string;
      reason: string;
    };
    'auth.session.refresh_reused': {
      authSessionId?: string;
    };
    'auth.security.detected': {
      type: 'new_device_login' | 'refresh_replay' | 'sessions_revoked';
      userId: string;
      authSessionId?: string;
      reason?: string;
      notification: 'policy_pending' | 'none';
    };
    'auth.sessions.revoke_requested': {
      userId: string;
      reason: string;
    };
  }
}

export interface CreateAuthSessionInput {
  userSessionId: string;
  installationId: string;
  platform: string;
  deviceName?: string;
  appVersion?: string;
}

export type AuthRefreshResult =
  | {
      status: 'rotated';
      refreshToken: string;
      refreshExpiresAt: Date;
      authSessionId: string;
      userSessionId: string;
    }
  | {
      status: 'reused';
      code: (typeof AuthSessionErrorCode)['reused'];
      authSessionId: string;
      platform: string;
    }
  | { status: 'invalid'; code: (typeof AuthSessionErrorCode)['invalid'] }
  | { status: 'expired'; code: (typeof AuthSessionErrorCode)['expired'] }
  | { status: 'revoked'; code: (typeof AuthSessionErrorCode)['revoked'] }
  | {
      status: 'temporarily_unavailable';
      code: (typeof AuthSessionErrorCode)['temporarilyUnavailable'];
    };

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly config: Config,
    private readonly crypto: CryptoHelper,
    private readonly cache: Cache,
    private readonly event: EventBus,
    private readonly models: Models
  ) {}

  get accessTokenTtl() {
    return this.config.auth.token.accessTokenTtl;
  }

  @Transactional()
  async create(input: CreateAuthSessionInput) {
    const isNewDevice = !(await this.models.authSession.hasUserInstallation(
      input.userSessionId,
      input.installationId
    ));
    const now = new Date();
    const absoluteExpiresAt = new Date(
      now.getTime() + this.config.auth.token.refreshAbsoluteTtl * 1000
    );
    const idleExpiresAt = this.idleExpiresAt(now, absoluteExpiresAt);
    const refresh = this.createRefreshToken(idleExpiresAt);
    const session = await this.models.authSession.create({
      ...input,
      idleExpiresAt,
      absoluteExpiresAt,
      refreshToken: refresh.persisted,
    });
    metrics.auth.counter('auth_session_created').add(1, {
      platform: input.platform,
    });
    this.event.emit('auth.session.created', {
      authSessionId: session.id,
      platform: input.platform,
    });
    const created = isNewDevice
      ? await this.models.authSession.get(session.id)
      : null;
    if (created) {
      this.event.emit('auth.security.detected', {
        type: 'new_device_login',
        userId: created.userSession.userId,
        authSessionId: session.id,
        notification: 'policy_pending',
      });
    }

    return {
      session,
      refreshToken: refresh.token,
      refreshExpiresAt: idleExpiresAt,
    };
  }

  async refresh(
    refreshToken: string,
    appVersion?: string
  ): Promise<AuthRefreshResult> {
    const parsed = this.parseRefreshToken(refreshToken);
    if (!parsed) {
      return { status: 'invalid', code: AuthSessionErrorCode.invalid };
    }

    const now = new Date();
    const refresh = await this.preparedRefresh(
      parsed.id,
      new Date(now.getTime() + this.config.auth.token.refreshIdleTtl * 1000)
    );
    if (!refresh) {
      metrics.auth.counter('auth_refresh').add(1, {
        result: 'temporarily_unavailable',
        platform: 'unknown',
      });
      return {
        status: 'temporarily_unavailable',
        code: AuthSessionErrorCode.temporarilyUnavailable,
      };
    }
    const result = await this.models.authSession.rotate({
      id: parsed.id,
      secretHash: parsed.secretHash,
      now,
      idleExpiresAt: refresh.persisted.expiresAt,
      graceMs: this.config.auth.token.refreshGracePeriod * 1000,
      appVersion,
      next: refresh.persisted,
    });
    if (result.status === 'reused') {
      metrics.auth.counter('auth_refresh').add(1, {
        result: result.status,
        platform: result.platform,
      });
      this.event.emit('auth.session.refresh_reused', {
        authSessionId: result.authSessionId,
      });
      const reused = await this.models.authSession.get(result.authSessionId);
      if (reused) {
        this.event.emit('auth.security.detected', {
          type: 'refresh_replay',
          userId: reused.userSession.userId,
          authSessionId: result.authSessionId,
          notification: 'policy_pending',
        });
      }
      return {
        ...result,
        code: AuthSessionErrorCode.reused,
      };
    }
    if (result.status === 'invalid') {
      metrics.auth.counter('auth_refresh').add(1, {
        result: result.status,
        platform: 'unknown',
      });
      return { ...result, code: AuthSessionErrorCode.invalid };
    }
    if (result.status === 'expired') {
      metrics.auth.counter('auth_refresh').add(1, {
        result: result.status,
        platform: 'unknown',
      });
      return { ...result, code: AuthSessionErrorCode.expired };
    }
    if (result.status === 'revoked') {
      metrics.auth.counter('auth_refresh').add(1, {
        result: result.status,
        platform: 'unknown',
      });
      return { ...result, code: AuthSessionErrorCode.revoked };
    }
    if (result.status === 'temporarily_unavailable') {
      metrics.auth.counter('auth_refresh').add(1, {
        result: result.status,
        platform: 'unknown',
      });
      return {
        status: result.status,
        code: AuthSessionErrorCode.temporarilyUnavailable,
      };
    }

    const session = await this.models.authSession.get(result.authSessionId);
    if (!session) {
      return { status: 'revoked', code: AuthSessionErrorCode.revoked };
    }
    metrics.auth.counter('auth_refresh').add(1, {
      result: result.status,
      platform: result.platform,
    });
    if (result.status === 'grace') {
      metrics.auth.counter('auth_refresh_grace').add(1, {
        platform: result.platform,
      });
    }
    this.event.emit('auth.session.refreshed', {
      authSessionId: result.authSessionId,
    });

    return {
      status: 'rotated',
      authSessionId: result.authSessionId,
      userSessionId: result.userSessionId,
      refreshToken: refresh.token,
      refreshExpiresAt:
        refresh.persisted.expiresAt < session.absoluteExpiresAt
          ? refresh.persisted.expiresAt
          : session.absoluteExpiresAt,
    };
  }

  async revoke(id: string, reason: string, userId?: string) {
    const revoked = await this.models.authSession.revoke(id, reason, userId);
    if (revoked) {
      metrics.auth.counter('auth_session_revoked').add(1, { reason });
      this.event.emit('auth.session.revoked', {
        authSessionId: id,
        reason,
      });
    }
    return revoked;
  }

  async revokeUserSessions(userId: string, reason: string) {
    const { count } = await this.models.authSession.revokeUserSessions(
      userId,
      reason
    );
    if (count) {
      metrics.auth.counter('auth_session_revoked').add(count, { reason });
      this.event.emit('auth.security.detected', {
        type: 'sessions_revoked',
        userId,
        reason,
        notification: 'none',
      });
    }
    return count;
  }

  @OnEvent('user.preDelete')
  async onUserPreDelete({ id }: Events['user.preDelete']) {
    await this.revokeUserSessions(id, 'user_deleted_or_disabled');
  }

  async revokeWithRefreshToken(refreshToken: string) {
    const parsed = this.parseRefreshToken(refreshToken);
    if (!parsed) return;
    const sessionId = await this.models.authSession.findByRefreshToken(
      parsed.id,
      parsed.secretHash
    );
    if (sessionId) await this.revoke(sessionId, 'refresh_token_revoke');
  }

  async list(userId: string) {
    return (await this.models.authSession.list(userId)).map(session => ({
      id: session.id,
      installationId: session.installationId,
      platform: session.platform,
      deviceName: session.deviceName,
      appVersion: session.appVersion,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      revokedAt: session.revokedAt,
      revokeReason: session.revokeReason,
    }));
  }

  async get(id: string) {
    return await this.models.authSession.get(id);
  }

  async cleanup() {
    const before = new Date(
      Date.now() - this.config.auth.token.refreshRetention * 1000
    );
    let total = 0;
    for (;;) {
      const count = await this.models.authSession.deleteExpiredRefreshTokens(
        before,
        1000
      );
      total += count;
      if (count < 1000) break;
    }
    for (;;) {
      const count = await this.models.authSession.deleteExpiredSessions(
        before,
        1000
      );
      total += count;
      if (count < 1000) return total;
    }
  }

  private createRefreshToken(expiresAt: Date) {
    const created = createAuthSessionRefreshToken();
    return {
      token: created.token,
      persisted: {
        id: created.id,
        secretHash: created.secretHash,
        expiresAt,
      },
    };
  }

  private async preparedRefresh(sourceTokenId: string, expiresAt: Date) {
    const key = `auth:session-refresh:${sourceTokenId}`;
    const created = this.createRefreshToken(expiresAt);
    await this.cache.setnx(key, this.crypto.encrypt(JSON.stringify(created)), {
      ttl: this.config.auth.token.refreshGracePeriod * 1000 + 5000,
    });
    const encrypted = await this.cache.get<string>(key);
    if (!encrypted) return null;
    const cached = JSON.parse(this.crypto.decrypt(encrypted)) as {
      token: string;
      persisted: { id: string; secretHash: string; expiresAt: string };
    };
    return {
      token: cached.token,
      persisted: {
        ...cached.persisted,
        expiresAt: new Date(cached.persisted.expiresAt),
      },
    };
  }

  private parseRefreshToken(token: string) {
    return parseAuthSessionRefreshToken(token);
  }

  private idleExpiresAt(now: Date, absoluteExpiresAt: Date) {
    const idleExpiresAt = new Date(
      now.getTime() + this.config.auth.token.refreshIdleTtl * 1000
    );
    return idleExpiresAt < absoluteExpiresAt
      ? idleExpiresAt
      : absoluteExpiresAt;
  }
}
