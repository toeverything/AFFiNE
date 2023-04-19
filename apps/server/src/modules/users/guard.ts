import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { Observable } from 'rxjs';

import { getRequestResponseFromContext } from '../../utils/nestjs';

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
    // FIXME: remove this mock user when authorization logic is implemented
    return {
      id: '1',
      name: 'John Doe',
      email: '',
      password: '',
      tokenNonce: 1,
      avatarUrl: '',
      createdAt: new Date(),
    } as User;

    // return getUserFromContext(context);
  }
);

@Injectable()
class AuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext
  ): boolean | Promise<boolean> | Observable<boolean> {
    const user = getUserFromContext(context);
    return Boolean(user);
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
