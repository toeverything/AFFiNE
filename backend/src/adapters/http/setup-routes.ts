import fp from 'fastify-plugin';
import { z } from 'zod';

import {
  publicUser,
  type AuthService,
} from '../../application/auth-service.js';
import { attachAuthCookies, type CookiePolicy } from './cookies.js';

const CreateAdmin = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  password: z.string().min(1),
});

export const setupRoutes = fp<{
  auth: AuthService;
  cookies: CookiePolicy;
}>(
  async (app, opts) => {
    app.post('/api/setup/create-admin-user', async (request, reply) => {
      const body = CreateAdmin.parse(request.body);
      const result = await opts.auth.createAdmin({
        ...body,
        clientKind:
          request.headers['x-affine-client-kind'] === 'native'
            ? 'native'
            : 'web',
      });
      attachAuthCookies(
        reply,
        result.session,
        result.cookieToken,
        opts.cookies
      );
      return publicUser(result.user);
    });
  },
  { name: 'mosaic-setup-routes' }
);
