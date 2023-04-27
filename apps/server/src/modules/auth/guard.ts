import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UseGuards,
} from '@nestjs/common';

import { PrismaService } from '../../prisma';
import { getRequestResponseFromContext } from '../../utils/nestjs';
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
  constructor(private auth: AuthService, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const { req } = getRequestResponseFromContext(context);
    const token = req.headers.authorization;
    if (!token) {
      return false;
    }

    const claims = this.auth.verify(token);
    req.user = await this.prisma.user.findUnique({ where: { id: claims.id } });
    return !!req.user;
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
