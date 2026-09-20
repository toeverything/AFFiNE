import { Injectable } from '@nestjs/common';

import { EventBus, metrics, OnEvent } from '../../base';
import { BackendRuntimeProvider } from '../backend-runtime';

export const AuthSessionErrorCode = {
  invalid: 'REFRESH_TOKEN_INVALID',
  expired: 'AUTH_SESSION_EXPIRED',
  revoked: 'AUTH_SESSION_REVOKED',
  reused: 'REFRESH_TOKEN_REUSED',
  temporarilyUnavailable: 'AUTH_SESSION_TEMPORARILY_UNAVAILABLE',
} as const;

declare global {
  interface Events {
    'auth.session.created': { authSessionId: string; platform: string };
    'auth.session.refreshed': { authSessionId: string };
    'auth.session.revoked': { authSessionId: string; reason: string };
    'auth.session.refresh_reused': { authSessionId?: string };
    'auth.security.detected': {
      type: 'new_device_login' | 'refresh_replay' | 'sessions_revoked';
      userId: string;
      authSessionId?: string;
      reason?: string;
      notification: 'policy_pending' | 'none';
    };
    'auth.sessions.revoke_requested': { userId: string; reason: string };
  }
}

export interface AuthSessionListItem {
  id: string;
  installationId: string;
  platform: string;
  deviceName?: string;
  appVersion?: string;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt?: Date;
  revokeReason?: string;
}

export type AuthRefreshResult =
  | {
      status: 'rotated';
      userId: string;
      tokenType: 'Bearer';
      accessToken: string;
      expiresIn: number;
      refreshToken: string;
      refreshExpiresAt: Date;
      session: { id: string; absoluteExpiresAt: Date };
      authSessionId: string;
      platform: string;
      grace: boolean;
    }
  | {
      status: 'reused';
      code: (typeof AuthSessionErrorCode)['reused'];
      userId: string;
      authSessionId: string;
      platform: string;
    }
  | { status: 'invalid'; code: (typeof AuthSessionErrorCode)['invalid'] }
  | { status: 'expired'; code: (typeof AuthSessionErrorCode)['expired'] }
  | { status: 'revoked'; code: (typeof AuthSessionErrorCode)['revoked'] }
  | {
      status: 'temporarily_unavailable';
      code: (typeof AuthSessionErrorCode)['temporarilyUnavailable'];
    }
  | { status: 'rate_limited'; code: 'AUTH_REFRESH_RATE_LIMITED' };

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly rt: BackendRuntimeProvider,
    private readonly event: EventBus
  ) {}

  async refresh(refreshToken: string, appVersion?: string) {
    const result = await this.rt.executeAuthSessionCommandV1<AuthRefreshResult>(
      {
        action: 'refresh',
        refreshToken,
        appVersion,
      }
    );
    metrics.auth.counter('auth_refresh').add(1, {
      result: result.status,
      platform: 'platform' in result ? result.platform : 'unknown',
    });
    if (result.status === 'rotated') {
      if (result.grace) {
        metrics.auth.counter('auth_refresh_grace').add(1, {
          platform: result.platform,
        });
      }
      this.event.emit('auth.session.refreshed', {
        authSessionId: result.authSessionId,
      });
      return {
        ...result,
        refreshExpiresAt: new Date(result.refreshExpiresAt),
        session: {
          ...result.session,
          absoluteExpiresAt: new Date(result.session.absoluteExpiresAt),
        },
      };
    }
    if (result.status === 'reused') {
      this.event.emit('auth.session.refresh_reused', {
        authSessionId: result.authSessionId,
      });
      this.event.emit('auth.security.detected', {
        type: 'refresh_replay',
        userId: result.userId,
        authSessionId: result.authSessionId,
        notification: 'policy_pending',
      });
    }
    return result;
  }

  async revoke(id: string, reason: string, userId?: string) {
    const revoked = await this.rt.executeAuthSessionCommandV1<boolean>({
      action: 'revoke_session',
      authSessionId: id,
      userId,
      reason,
    });
    if (revoked) {
      metrics.auth.counter('auth_session_revoked').add(1, { reason });
      this.event.emit('auth.session.revoked', { authSessionId: id, reason });
    }
    return revoked;
  }

  async revokeUserSessions(userId: string, reason: string) {
    const count = await this.rt.executeAuthSessionCommandV1<number>({
      action: 'revoke_user',
      userId,
      reason,
    });
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
    await this.rt.executeAuthSessionCommandV1({
      action: 'revoke_refresh',
      refreshToken,
    });
  }

  async list(userId: string): Promise<AuthSessionListItem[]> {
    type EncodedItem = Omit<
      AuthSessionListItem,
      | 'createdAt'
      | 'lastSeenAt'
      | 'idleExpiresAt'
      | 'absoluteExpiresAt'
      | 'revokedAt'
    > & {
      createdAt: string;
      lastSeenAt: string;
      idleExpiresAt: string;
      absoluteExpiresAt: string;
      revokedAt?: string;
    };
    const items = await this.rt.executeAuthSessionCommandV1<EncodedItem[]>({
      action: 'list',
      userId,
    });
    return items.map(item => ({
      ...item,
      createdAt: new Date(item.createdAt),
      lastSeenAt: new Date(item.lastSeenAt),
      idleExpiresAt: new Date(item.idleExpiresAt),
      absoluteExpiresAt: new Date(item.absoluteExpiresAt),
      revokedAt: item.revokedAt ? new Date(item.revokedAt) : undefined,
    }));
  }

  async cleanup(limit = 1000) {
    return await this.rt.executeAuthSessionCommandV1<number>({
      action: 'cleanup',
      limit,
    });
  }
}
