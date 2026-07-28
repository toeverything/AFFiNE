import { Injectable } from '@nestjs/common';

import { AuthSessionTemporarilyUnavailable, Config } from '../../base';
import { Models } from '../../models';
import {
  authSessionAccessTokenKeyId,
  signAuthSessionAccessToken,
  verifyAuthSessionAccessToken,
} from '../../native';
import { sessionUser } from './service';
import type { AuthSessionPrincipal, CurrentUser } from './session';
import { AuthSigningKeyRing } from './signing-key';

export type SessionAccessTokenErrorCode =
  | 'ACCESS_TOKEN_EXPIRED'
  | 'ACCESS_TOKEN_INVALID'
  | 'AUTH_SESSION_EXPIRED'
  | 'AUTH_SESSION_REVOKED';

export class SessionAccessTokenError extends Error {
  constructor(readonly code: SessionAccessTokenErrorCode) {
    super(code);
  }
}

export interface SignedAccessToken {
  token: string;
  expiresAt: Date;
}

const SIGNING_KEY_RETRY_LIMIT = 3;

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly models: Models,
    private readonly config: Config,
    private readonly keys: AuthSigningKeyRing
  ) {}

  async sign(
    userId: string,
    authSessionId: string
  ): Promise<SignedAccessToken> {
    const ttl = this.config.auth.token.accessTokenTtl;
    for (let attempt = 0; attempt < SIGNING_KEY_RETRY_LIMIT; attempt++) {
      const issuedAt = Math.floor(Date.now() / 1000);
      const expiresAtSeconds = issuedAt + ttl;
      const expiresAt = new Date(expiresAtSeconds * 1000);
      const key = await this.keys.active();
      const token = signAuthSessionAccessToken(
        userId,
        authSessionId,
        key.id,
        key.secret,
        issuedAt,
        expiresAtSeconds
      );
      if ((await this.keys.active()).id === key.id) {
        return { token, expiresAt };
      }
    }
    throw new AuthSessionTemporarilyUnavailable();
  }

  async verify(token: string): Promise<AuthSessionPrincipal> {
    const keyId = authSessionAccessTokenKeyId(token);
    if (!keyId) {
      throw new SessionAccessTokenError('ACCESS_TOKEN_INVALID');
    }
    const key = await this.keys.verify(keyId);
    if (!key) throw new SessionAccessTokenError('ACCESS_TOKEN_INVALID');
    const verified = verifyAuthSessionAccessToken(
      token,
      keyId,
      key.secret,
      Math.floor(Date.now() / 1000)
    );
    if (verified.status !== 'valid') {
      throw new SessionAccessTokenError(
        verified.status === 'expired'
          ? 'ACCESS_TOKEN_EXPIRED'
          : 'ACCESS_TOKEN_INVALID'
      );
    }
    const { authSessionId, userId } = verified;
    if (!authSessionId || !userId) {
      throw new SessionAccessTokenError('ACCESS_TOKEN_INVALID');
    }
    const authSession = await this.models.authSession.get(authSessionId);
    if (!authSession || authSession.userSession.userId !== userId) {
      throw new SessionAccessTokenError('ACCESS_TOKEN_INVALID');
    }
    if (authSession.revokedAt) {
      throw new SessionAccessTokenError('AUTH_SESSION_REVOKED');
    }
    const now = new Date();
    if (
      authSession.idleExpiresAt <= now ||
      authSession.absoluteExpiresAt <= now ||
      (authSession.userSession.expiresAt &&
        authSession.userSession.expiresAt <= now)
    ) {
      throw new SessionAccessTokenError('AUTH_SESSION_EXPIRED');
    }
    const user = await this.models.user.get(userId);
    if (!user || user.disabled) {
      throw new SessionAccessTokenError('AUTH_SESSION_REVOKED');
    }
    return {
      ...authSession.userSession,
      authSessionId: authSession.id,
      authenticatedAt: authSession.createdAt,
      user: sessionUser(user) as CurrentUser,
    };
  }
}
