import type { CanActivate, ExecutionContext } from '@nestjs/common';
import {
  createParamDecorator,
  Inject,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import type { NextAuthOptions } from 'next-auth';
import { AuthHandler } from 'next-auth/core';

import { PrismaService } from '../../prisma';
import { getRequestResponseFromContext } from '../../utils/nestjs';
import { NextAuthOptionsProvide } from './next-auth-options';
import { AuthService } from './service';

export function getUserFromContext(context: ExecutionContext) {
  const req = getRequestResponseFromContext(context).req;
  return req.user;
}

/**
 * Used to fetch current user from the request context.
 *
 * > The user may be undefined if authorization token is not provided.
 *
 * @example
 *
 * ```typescript
 * // Graphql Query
 * \@Query(() => UserType)
 * user(@CurrentUser() user?: User) {
 *  return user;
 * }
 * ```
 *
 * ```typescript
 * // HTTP Controller
 * \@Get('/user)
 * user(@CurrentUser() user?: User) {
 *   return user;
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) => {
    return getUserFromContext(context);
  }
);

@Injectable()
class AuthGuard implements CanActivate {
  constructor(
    @Inject(NextAuthOptionsProvide)
    private readonly nextAuthOptions: NextAuthOptions,
    private auth: AuthService,
    private prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext) {
    const { req, res } = getRequestResponseFromContext(context);
    const token = req.headers.authorization;
    if (!token) {
      const session = await AuthHandler({
        req: {
          cookies: req.cookies,
          action: 'session',
          method: 'GET',
          headers: req.headers,
        },
        options: this.nextAuthOptions,
      });
      const { body, cookies, status = 200 } = session;
      // @ts-expect-error body is user here
      req.user = body.user;
      if (cookies && res) {
        for (const cookie of cookies) {
          res.cookie(cookie.name, cookie.value, cookie.options);
        }
      }
      return Boolean(
        status === 200 &&
          body &&
          typeof body !== 'string' &&
          Object.keys(body).length
      );
    } else {
      const [type, jwt] = token.split(' ') ?? [];

      if (type === 'Bearer') {
        const claims = await this.auth.verify(jwt);
        req.user = await this.prisma.user.findUnique({
          where: { id: claims.id },
        });
        return !!req.user;
      }
    }
    return false;
  }
}

/**
 * This guard is used to protect routes/queries/mutations that require a user to be logged in.
 *
 * The `@CurrentUser()` parameter decorator used in a `Auth` guarded queries would always give us the user because the `Auth` guard will
 * fast throw if user is not logged in.
 *
 * @example
 *
 * ```typescript
 * \@Auth()
 * \@Query(() => UserType)
 * user(@CurrentUser() user: User) {
 *   return user;
 * }
 * ```
 */
export const Auth = () => {
  return UseGuards(AuthGuard);
};
