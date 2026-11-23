import { Injectable } from '@nestjs/common';

import { BackendRuntimeProvider } from '../backend-runtime';
import type { AuthSessionPrincipal } from './session';

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

type EncodedPrincipal = Omit<
  AuthSessionPrincipal,
  'createdAt' | 'expiresAt' | 'authenticatedAt'
> & {
  createdAt: string;
  expiresAt?: string;
  authenticatedAt: string;
};

type PrincipalResult =
  | { status: 'valid'; principal: EncodedPrincipal }
  | { status: 'invalid' }
  | { status: 'access_token_expired' }
  | { status: 'auth_session_expired' }
  | { status: 'auth_session_revoked' };

@Injectable()
export class AccessTokenService {
  constructor(private readonly rt: BackendRuntimeProvider) {}

  async verify(token: string): Promise<AuthSessionPrincipal> {
    const result = await this.rt.resolveAuthPrincipalV1<PrincipalResult>({
      type: 'access_token',
      token,
    });
    if (result.status !== 'valid') {
      throw new SessionAccessTokenError(errorCode(result.status));
    }
    return {
      ...result.principal,
      createdAt: new Date(result.principal.createdAt),
      expiresAt: result.principal.expiresAt
        ? new Date(result.principal.expiresAt)
        : null,
      authenticatedAt: new Date(result.principal.authenticatedAt),
    };
  }
}

function errorCode(
  status: Exclude<PrincipalResult, { status: 'valid' }>['status']
) {
  switch (status) {
    case 'access_token_expired':
      return 'ACCESS_TOKEN_EXPIRED';
    case 'auth_session_expired':
      return 'AUTH_SESSION_EXPIRED';
    case 'auth_session_revoked':
      return 'AUTH_SESSION_REVOKED';
    default:
      return 'ACCESS_TOKEN_INVALID';
  }
}
