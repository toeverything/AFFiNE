import os from 'node:os';

import type { AuthTokenResponse } from '@affine/auth';
import { session } from 'electron';

import { logger } from '../logger';
import type { NamespaceHandlers } from '../type';
import {
  clearAuthSession,
  getInstallationId,
  getValidAccessToken,
  revokeAuthSession,
  setAuthSession,
} from './auth-session';
import { authFetch, getAuthTransportSession } from './transport';

export interface SignInResponse {
  id?: string;
  email?: string;
  name?: string;
  hasPassword?: boolean | null;
  avatarUrl?: string | null;
  emailVerified?: boolean;
  exchangeCode?: string;
  redirectUri?: string;
}

export interface PasswordSignInResponse extends SignInResponse {
  id: string;
  email: string;
  name: string;
  hasPassword: boolean | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  sessionOnly?: boolean;
}

const authCookieNames = [
  'affine_session',
  'affine_user_id',
  'affine_csrf_token',
];

function authUrl(endpoint: string, path: string) {
  return new URL(path, endpoint).toString();
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    let message = text || response.statusText;
    try {
      const error = JSON.parse(text);
      if (typeof error.message === 'string') {
        message = error.message;
      }
    } catch {}
    throw new Error(message);
  }

  return text ? JSON.parse(text) : ({} as T);
}

async function fetchAuth(endpoint: string, path: string, body?: unknown) {
  return await authFetch(authUrl(endpoint, path), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-affine-client-kind': 'native',
      'x-affine-version': BUILD_CONFIG.appVersion,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function clearAuthCookies(endpoint: string) {
  const sessions = [session.defaultSession, getAuthTransportSession()];
  await Promise.all(
    sessions.flatMap(authSession =>
      authCookieNames.map(name =>
        authSession.cookies
          .remove(endpoint, name)
          .catch(error =>
            logger.debug(
              'failed to clear native auth cookie',
              endpoint,
              name,
              error
            )
          )
      )
    )
  );
}

async function exchangeSession(endpoint: string, response: SignInResponse) {
  if (!response.exchangeCode) {
    throw new Error('Missing native auth exchange code.');
  }

  const exchangeResponse = await fetchAuth(
    endpoint,
    '/api/auth/session/exchange',
    {
      code: response.exchangeCode,
      installationId: await getInstallationId(),
      platform: 'electron',
      deviceName: os.hostname(),
    }
  );
  const body = await readJson<AuthTokenResponse>(exchangeResponse);
  const { persistent } = await setAuthSession(endpoint, body);
  await clearAuthCookies(endpoint);
  return { persistent };
}

export const authHandlers = {
  signInMagicLink: async (
    _,
    endpoint: string,
    email: string,
    token: string,
    clientNonce?: string
  ) => {
    const response = await fetchAuth(endpoint, '/api/auth/magic-link', {
      email,
      token,
      client_nonce: clientNonce,
    });
    const body = await readJson<SignInResponse>(response);
    const { persistent } = await exchangeSession(endpoint, body);
    return { sessionOnly: !persistent };
  },

  signInOauth: async (
    _,
    endpoint: string,
    code: string,
    state: string,
    clientNonce?: string
  ) => {
    const response = await fetchAuth(endpoint, '/api/oauth/callback', {
      code,
      state,
      client_nonce: clientNonce,
    });
    const body = await readJson<SignInResponse>(response);
    const { persistent } = await exchangeSession(endpoint, body);
    return { redirectUri: body.redirectUri, sessionOnly: !persistent };
  },

  signInPassword: async (
    _,
    endpoint: string,
    credential: {
      email: string;
      password: string;
      verifyToken?: string;
      challenge?: string;
    }
  ) => {
    const response = await authFetch(authUrl(endpoint, '/api/auth/sign-in'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-affine-client-kind': 'native',
        'x-affine-version': BUILD_CONFIG.appVersion,
        ...(credential.verifyToken
          ? { 'x-captcha-token': credential.verifyToken }
          : {}),
        ...(credential.verifyToken
          ? {
              'x-captcha-provider': credential.challenge
                ? 'hashcash'
                : 'turnstile',
            }
          : {}),
        ...(credential.challenge
          ? { 'x-captcha-challenge': credential.challenge }
          : {}),
      },
      body: JSON.stringify({
        email: credential.email,
        password: credential.password,
      }),
    });
    const body = await readJson<PasswordSignInResponse>(response);
    const { persistent } = await exchangeSession(endpoint, body);
    return { ...body, sessionOnly: !persistent };
  },

  signInOpenAppSignInCode: async (_e, endpoint: string, code: string) => {
    const response = await fetchAuth(endpoint, '/api/auth/open-app/sign-in', {
      code,
    });
    const { persistent } = await exchangeSession(
      endpoint,
      await readJson(response)
    );
    return { sessionOnly: !persistent };
  },

  signOut: async (_e, endpoint: string) => {
    try {
      await revokeAuthSession(endpoint);
    } finally {
      await clearAuthCookies(endpoint);
    }
  },

  clearSession: async (_e, endpoint: string) => {
    await clearAuthSession(endpoint, 'local-clear');
  },

  getValidAccessToken: async (_e, endpoint: string) => {
    return { token: await getValidAccessToken(endpoint, 120_000) };
  },
} satisfies NamespaceHandlers;
