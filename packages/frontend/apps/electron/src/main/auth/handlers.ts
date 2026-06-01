import { net, session } from 'electron';

import { logger } from '../logger';
import type { NamespaceHandlers } from '../type';
import {
  deleteNativeAuthToken,
  getNativeAuthToken,
  setNativeAuthToken,
} from './native-token';

interface SignInResponse {
  exchangeCode?: string;
  redirectUri?: string;
}

interface ExchangeResponse {
  token?: string;
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
    throw new Error(text || response.statusText);
  }

  return text ? JSON.parse(text) : ({} as T);
}

async function fetchAuth(endpoint: string, path: string, body?: unknown) {
  return await net.fetch(authUrl(endpoint, path), {
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
  await Promise.all(
    authCookieNames.map(name =>
      session.defaultSession.cookies
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
  );
}

async function exchangeSession(endpoint: string, response: SignInResponse) {
  if (!response.exchangeCode) {
    throw new Error('Missing native auth exchange code.');
  }

  const exchangeResponse = await fetchAuth(
    endpoint,
    '/api/auth/native/exchange',
    { code: response.exchangeCode }
  );
  const body = await readJson<ExchangeResponse>(exchangeResponse);
  if (!body.token) {
    throw new Error('Missing native auth token.');
  }

  setNativeAuthToken(endpoint, body.token);
  await clearAuthCookies(endpoint);
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
    await exchangeSession(endpoint, await readJson(response));
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
    await exchangeSession(endpoint, body);
    return { redirectUri: body.redirectUri };
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
    const response = await net.fetch(authUrl(endpoint, '/api/auth/sign-in'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-affine-client-kind': 'native',
        'x-affine-version': BUILD_CONFIG.appVersion,
        ...(credential.verifyToken
          ? { 'x-captcha-token': credential.verifyToken }
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
    await exchangeSession(endpoint, await readJson(response));
  },

  signInOpenAppSignInCode: async (_e, endpoint: string, code: string) => {
    const response = await fetchAuth(endpoint, '/api/auth/open-app/sign-in', {
      code,
    });
    await exchangeSession(endpoint, await readJson(response));
  },

  signOut: async (_e, endpoint: string) => {
    const token = getNativeAuthToken(endpoint);
    if (token) {
      await net.fetch(authUrl(endpoint, '/api/auth/sign-out'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-affine-version': BUILD_CONFIG.appVersion,
        },
      });
    }

    deleteNativeAuthToken(endpoint);
    await clearAuthCookies(endpoint);
  },

  readEndpointToken: async (_e, endpoint: string) => {
    return { token: getNativeAuthToken(endpoint) };
  },
} satisfies NamespaceHandlers;
