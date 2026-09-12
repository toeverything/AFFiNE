import { timingSafeEqual } from 'node:crypto';

import type { FastifyReply } from 'fastify';

import type { Session } from '../../domain/identity.js';

export const COOKIE_SESSION = 'affine_session';
export const COOKIE_USER_ID = 'affine_user_id';
export const COOKIE_CSRF = 'affine_csrf_token';

export interface CookiePolicy {
  secure: boolean;
  domain?: string | undefined;
  maxAgeSec: number;
}

export function attachAuthCookies(
  reply: FastifyReply,
  session: Session,
  cookieToken: string,
  policy: CookiePolicy
): void {
  const base: {
    path: string;
    sameSite: 'lax';
    secure: boolean;
    maxAge: number;
    domain?: string;
  } = {
    path: '/',
    sameSite: 'lax',
    secure: policy.secure,
    maxAge: policy.maxAgeSec,
  };
  if (policy.domain) {
    base.domain = policy.domain;
  }
  void reply.setCookie(COOKIE_SESSION, cookieToken, {
    ...base,
    httpOnly: true,
  });
  void reply.setCookie(COOKIE_USER_ID, session.userId, {
    ...base,
    httpOnly: false,
  });
  void reply.setCookie(COOKIE_CSRF, session.csrfToken, {
    ...base,
    httpOnly: false,
  });
}

export function clearAuthCookies(
  reply: FastifyReply,
  policy: CookiePolicy
): void {
  const base: {
    path: string;
    sameSite: 'lax';
    secure: boolean;
    domain?: string;
  } = {
    path: '/',
    sameSite: 'lax',
    secure: policy.secure,
  };
  if (policy.domain) {
    base.domain = policy.domain;
  }
  void reply.clearCookie(COOKIE_SESSION, { ...base, httpOnly: true });
  void reply.clearCookie(COOKIE_USER_ID, { ...base, httpOnly: false });
  void reply.clearCookie(COOKIE_CSRF, { ...base, httpOnly: false });
}

export function parseCookieHeader(
  header: string | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) {
    return out;
  }
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // keep raw
    }
    out[key] = value;
  }
  return out;
}

export function csrfMatches(
  session: Session,
  header: string | undefined
): boolean {
  if (!header) {
    return false;
  }
  const expected = Buffer.from(session.csrfToken);
  const provided = Buffer.from(header);
  if (expected.length !== provided.length) {
    return false;
  }
  return timingSafeEqual(expected, provided);
}
