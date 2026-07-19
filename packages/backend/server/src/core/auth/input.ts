import type { Request } from 'express';
import { z } from 'zod';

import { getRequestCookie, getRequestHeader } from '../../base';

export const CLIENT_KIND_HEADER = 'x-affine-client-kind';
export const SESSION_COOKIE_NAME = 'affine_session';
export const USER_COOKIE_NAME = 'affine_user_id';
export const CSRF_COOKIE_NAME = 'affine_csrf_token';

const NativeClientOriginSchema = z
  .enum(['capacitor://localhost', 'ionic://localhost', 'https://localhost'])
  .optional();

const NativeClientHeadersSchema = z.object({
  clientKind: z.literal('native'),
  origin: NativeClientOriginSchema,
});

export const BearerHeaderSchema = z
  .string()
  .regex(/^Bearer\s+\S+$/i)
  .transform(value => value.replace(/^Bearer\s+/i, ''));

export function extractTokenFromHeader(authorization: string) {
  const parsed = BearerHeaderSchema.safeParse(authorization);
  return parsed.success ? parsed.data : undefined;
}

export const SessionIdSchema = z.string().uuid();

export const UserIdSchema = z.union([
  z.string().uuid(),
  z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
]);

const EmailSchema = z.string().max(320);
const ClientNonceSchema = z.string().min(1).max(512);
const ChallengeTokenSchema = z.string().min(1).max(512);

export const AuthPreflightBodySchema = z
  .object({ email: EmailSchema })
  .strict();

export const SignInBodySchema = z
  .object({
    email: EmailSchema,
    password: z.string().min(1).max(1024).optional(),
    callbackUrl: z.string().min(1).max(2048).optional(),
    client_nonce: ClientNonceSchema.optional(),
    // TODO(auth-session): remove these ignored body fields after Electron 0.26.x
    // compatibility is dropped; captcha credentials belong in request headers.
    verifyToken: z.string().max(4096).optional(),
    challenge: z.string().max(4096).optional(),
  })
  .strict();

export const MagicLinkBodySchema = z
  .object({
    email: EmailSchema,
    token: ChallengeTokenSchema,
    client_nonce: ClientNonceSchema.optional(),
  })
  .strict();

export const OpenAppSignInBodySchema = z
  .object({ code: ChallengeTokenSchema })
  .strict();

export const AuthSessionExchangeBodySchema = z
  .object({
    code: ChallengeTokenSchema,
    installationId: z.string().uuid(),
    platform: z.enum(['ios', 'android', 'electron']),
    deviceName: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const AuthSessionRefreshBodySchema = z
  .object({
    refreshToken: z.string().min(1).max(512),
  })
  .strict();

export function getSessionOptionsFromRequest(req: Request) {
  const sessionId = SessionIdSchema.safeParse(
    getRequestCookie(req, SESSION_COOKIE_NAME)
  );
  const userId = UserIdSchema.safeParse(
    getRequestCookie(req, USER_COOKIE_NAME)
  );

  return {
    sessionId: sessionId.success ? sessionId.data : undefined,
    userId: userId.success ? userId.data : undefined,
  };
}

export function isNativeClientRequest(req: Request) {
  return NativeClientHeadersSchema.safeParse({
    clientKind: getRequestHeader(req, CLIENT_KIND_HEADER),
    origin: getRequestHeader(req, 'origin'),
  }).success;
}
