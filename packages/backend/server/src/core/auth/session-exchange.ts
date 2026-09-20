import { HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import {
  ActionForbidden,
  EventBus,
  InvalidAuthState,
  TooManyRequest,
  UserFriendlyError,
} from '../../base';
import { BackendRuntimeProvider } from '../backend-runtime';
import { AuthSessionErrorCode, AuthSessionService } from './auth-session';
import { isNativeClientRequest } from './input';

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
    return { ...super.toJSON(), code: this.authCode };
  }
}

interface NativeTokenPair {
  userId: string;
  tokenType: 'Bearer';
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: string | Date;
  session: { id: string; absoluteExpiresAt: string | Date };
  isNewDevice?: boolean;
}

@Injectable()
export class SessionExchangeService {
  constructor(
    private readonly event: EventBus,
    private readonly rt: BackendRuntimeProvider,
    private readonly authSessions: AuthSessionService
  ) {}

  async exchange(req: Request, code: string, metadata: AuthSessionMetadata) {
    if (!isNativeClientRequest(req)) throw new ActionForbidden();
    let pair: NativeTokenPair;
    try {
      pair = await this.rt.executeAuthSessionCommandV1<NativeTokenPair>({
        action: 'exchange',
        code,
        ...metadata,
      });
    } catch (error) {
      if (String(error).includes('invalid_auth_state')) {
        throw new InvalidAuthState();
      }
      throw error;
    }
    this.event.emit('auth.session.created', {
      authSessionId: pair.session.id,
      platform: metadata.platform,
    });
    if (pair.isNewDevice) {
      this.event.emit('auth.security.detected', {
        type: 'new_device_login',
        userId: pair.userId,
        authSessionId: pair.session.id,
        notification: 'policy_pending',
      });
    }
    return publicPair(pair);
  }

  async refresh(req: Request, refreshToken: string, appVersion?: string) {
    if (!isNativeClientRequest(req)) throw new ActionForbidden();
    const refreshed = await this.authSessions.refresh(refreshToken, appVersion);
    if (refreshed.status === 'rate_limited') throw new TooManyRequest();
    if (refreshed.status !== 'rotated') {
      const status =
        refreshed.code === AuthSessionErrorCode.temporarilyUnavailable
          ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.UNAUTHORIZED;
      throw new AuthSessionHttpError(refreshed.code, status);
    }
    const {
      userId: _,
      authSessionId: __,
      platform: ___,
      grace: ____,
      ...pair
    } = refreshed;
    return pair;
  }
}

function publicPair({ userId: _, isNewDevice: __, ...pair }: NativeTokenPair) {
  return pair;
}
