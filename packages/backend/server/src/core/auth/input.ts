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

export const OAuthCallbackBodySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  client_nonce: z
    .string()
    .min(1)
    .nullish()
    .transform(value => value ?? undefined),
});

export const OAuthPreflightBodySchema = z.object({
  provider: z.string().min(1),
  redirect_uri: z
    .string()
    .min(1)
    .nullish()
    .transform(value => value ?? undefined),
  client: z
    .string()
    .min(1)
    .nullish()
    .transform(value => value ?? undefined),
  client_nonce: z.string().min(1),
});

export const OAuthStateEnvelopeSchema = z.object({
  state: z.string().min(1),
  provider: z.string().min(1).optional(),
});

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
