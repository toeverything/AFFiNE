import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import { User, UserSession } from '@prisma/client';

import { getRequestResponseFromContext } from '../../fundamentals';

function getUserFromContext(context: ExecutionContext) {
  return getRequestResponseFromContext(context).req.user;
}

/**
 * Used to fetch current user from the request context.
 *
 * > The user may be undefined if authorization token or session cookie is not provided.
 *
 * @example
 *
 * ```typescript
 * // Graphql Query
 * \@Query(() => UserType)
 * user(@CurrentUser() user: CurrentUser) {
 *  return user;
 * }
 * ```
 *
 * ```typescript
 * // HTTP Controller
 * \@Get('/user')
 * user(@CurrentUser() user: CurrentUser) {
 *   return user;
 * }
 * ```
 *
 * ```typescript
 * // for public apis
 * \@Public()
 * \@Get('/session')
 * session(@currentUser() user?: CurrentUser) {
 *   return user
 * }
 * ```
 */
// interface and variable don't conflict
// eslint-disable-next-line no-redeclare
export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) => {
    return getUserFromContext(context);
  }
);

export interface CurrentUser
  extends Pick<User, 'id' | 'email' | 'avatarUrl' | 'name'> {
  hasPassword: boolean | null;
  emailVerified: boolean;
}

export { type UserSession };
