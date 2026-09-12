import fp from 'fastify-plugin';

import type { AuthService } from '../../application/auth-service.js';
import { COOKIE_SESSION } from './cookies.js';
import './fastify-types.js';

function bearerToken(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }
  const match = /^Bearer\s+(\S+)/i.exec(header);
  return match?.[1];
}

export const sessionPlugin = fp<{ auth: AuthService }>(
  async (app, opts) => {
    app.decorateRequest('authSession', null);
    app.addHook('onRequest', async request => {
      const token = bearerToken(request.headers.authorization);
      if (token) {
        request.authSession = await opts.auth.authenticateBearer(token);
        return;
      }
      request.authSession = await opts.auth.authenticateCookie(
        request.cookies[COOKIE_SESSION]
      );
    });
  },
  { name: 'mosaic-session', dependencies: ['@fastify/cookie'] }
);
