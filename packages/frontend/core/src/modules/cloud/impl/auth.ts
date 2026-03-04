import type { Framework } from '@toeverything/infra';

import { AuthProvider } from '../provider/auth';
import { ServerScope } from '../scopes/server';
import { FetchService } from '../services/fetch';

const CSRF_COOKIE_NAME = 'affine_csrf_token';

function getCookieValue(name: string) {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookies = document.cookie ? document.cookie.split('; ') : [];
  for (const cookie of cookies) {
    const idx = cookie.indexOf('=');
    const key = idx === -1 ? cookie : cookie.slice(0, idx);
    if (key === name) {
      return idx === -1 ? '' : cookie.slice(idx + 1);
    }
  }
  return null;
}

export function configureDefaultAuthProvider(framework: Framework) {
  framework.scope(ServerScope).override(AuthProvider, resolver => {
    const fetchService = resolver.get(FetchService);
    return {
      async signInMagicLink(
        email: string,
        token: string,
        clientNonce?: string
      ) {
        await fetchService.fetch('/api/auth/magic-link', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, token, client_nonce: clientNonce }),
        });
      },

      async signInOauth(
        code: string,
        state: string,
        _provider: string,
        clientNonce?: string
      ) {
        const res = await fetchService.fetch('/api/oauth/callback', {
          method: 'POST',
          body: JSON.stringify({ code, state, client_nonce: clientNonce }),
          headers: {
            'content-type': 'application/json',
          },
        });
        return await res.json();
      },
      async signInPassword(credential: {
        email: string;
        password: string;
        verifyToken?: string;
        challenge?: string;
      }) {
        const headers: Record<string, string> = {};

        if (credential.verifyToken) {
          headers['x-captcha-token'] = credential.verifyToken;
        }
        if (credential.challenge) {
          headers['x-captcha-challenge'] = credential.challenge;
        }

        await fetchService.fetch('/api/auth/sign-in', {
          method: 'POST',
          body: JSON.stringify(credential),
          headers: {
            'content-type': 'application/json',
            ...headers,
          },
        });
      },
      async signOut() {
        const csrfToken = getCookieValue(CSRF_COOKIE_NAME);
        await fetchService.fetch('/api/auth/sign-out', {
          method: 'POST',
          headers: csrfToken ? { 'x-affine-csrf-token': csrfToken } : undefined,
        });
      },
    };
  });
}
