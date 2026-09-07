import type { UserSession } from '@prisma/client';

import type { BackendRuntimeProvider } from '../backend-runtime';
import type { CurrentUser } from './session';

export type CookiePrincipalResult =
  | {
      status: 'valid';
      principal: UserSession & { user: CurrentUser };
      refreshedExpiresAt?: Date;
    }
  | {
      status:
        | 'invalid'
        | 'access_token_expired'
        | 'auth_session_expired'
        | 'auth_session_revoked';
    };

export async function resolveCookiePrincipal(
  rt: BackendRuntimeProvider,
  sessionId: string,
  userId: string | undefined,
  refresh: boolean,
  refreshClientVersion?: string
): Promise<CookiePrincipalResult> {
  type EncodedSession = Omit<UserSession, 'createdAt' | 'expiresAt'> & {
    createdAt: string;
    expiresAt?: string;
    user: CurrentUser;
  };
  type Result =
    | {
        status: 'valid';
        principal: EncodedSession;
        refreshedExpiresAt?: string;
      }
    | Exclude<CookiePrincipalResult, { status: 'valid' }>;
  const result = await rt.resolveAuthPrincipalV1<Result>({
    type: 'cookie',
    sessionId,
    userId,
    refreshClientVersion,
    refresh,
  });
  if (result.status !== 'valid') return result;
  return {
    ...result,
    principal: {
      ...result.principal,
      createdAt: new Date(result.principal.createdAt),
      expiresAt: result.principal.expiresAt
        ? new Date(result.principal.expiresAt)
        : null,
    },
    refreshedExpiresAt: result.refreshedExpiresAt
      ? new Date(result.refreshedExpiresAt)
      : undefined,
  };
}
