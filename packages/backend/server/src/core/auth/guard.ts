import type {
  CanActivate,
  ExecutionContext,
  FactoryProvider,
  OnModuleInit,
} from '@nestjs/common';
import { Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import type { Request } from 'express';

import {
  AuthenticationRequired,
  Config,
  getRequestResponseFromContext,
  mapAnyError,
  parseCookies,
} from '../../fundamentals';
import { WEBSOCKET_OPTIONS } from '../../fundamentals/websocket';
import { CurrentUser, UserSession } from './current-user';
import { AuthService, parseAuthUserSeqNum } from './service';

function extractTokenFromHeader(authorization: string) {
  if (!/^Bearer\s/i.test(authorization)) {
    return;
  }

  return authorization.substring(7);
}

const PUBLIC_ENTRYPOINT_SYMBOL = Symbol('public');

@Injectable()
export class AuthGuard implements CanActivate, OnModuleInit {
  private auth!: AuthService;

  constructor(
    private readonly ref: ModuleRef,
    private readonly reflector: Reflector
  ) {}

  onModuleInit() {
    this.auth = this.ref.get(AuthService, { strict: false });
  }

  async canActivate(context: ExecutionContext) {
    const { req, res } = getRequestResponseFromContext(context);

    const userSession = await this.signIn(req);
    if (res && userSession && userSession.session.expiresAt) {
      await this.auth.refreshUserSessionIfNeeded(req, res, userSession.session);
    }

    // api is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ENTRYPOINT_SYMBOL,
      [context.getClass(), context.getHandler()]
    );

    if (isPublic) {
      return true;
    }

    if (!req.user) {
      throw new AuthenticationRequired();
    }
    return true;
  }

  async signIn(
    req: Request
  ): Promise<{ user: CurrentUser; session: UserSession } | null> {
    if (req.user && req.session) {
      return {
        user: req.user,
        session: req.session,
      };
    }

    parseCookies(req);
    let sessionToken: string | undefined =
      req.cookies[AuthService.sessionCookieName];

    if (!sessionToken && req.headers.authorization) {
      sessionToken = extractTokenFromHeader(req.headers.authorization);
    }

    if (sessionToken) {
      const userSeq = parseAuthUserSeqNum(
        req.headers[AuthService.authUserSeqHeaderName]
      );

      const userSession = await this.auth.getUserSession(sessionToken, userSeq);

      if (userSession) {
        req.session = userSession.session;
        req.user = userSession.user;
      }

      return userSession;
    }

    return null;
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
 * user(@CurrentUser() user: CurrentUser) {
 *   return user;
 * }
 * ```
 */
export const Auth = () => {
  return UseGuards(AuthGuard);
};

// api is public accessible
export const Public = () => SetMetadata(PUBLIC_ENTRYPOINT_SYMBOL, true);

export const AuthWebsocketOptionsProvider: FactoryProvider = {
  provide: WEBSOCKET_OPTIONS,
  useFactory: (config: Config, guard: AuthGuard) => {
    return {
      ...config.websocket,
      allowRequest: async (
        req: any,
        pass: (err: string | null | undefined, success: boolean) => void
      ) => {
        if (!config.websocket.requireAuthentication) {
          return pass(null, true);
        }

        try {
          const authentication = await guard.signIn(req);

          if (authentication) {
            return pass(null, true);
          } else {
            return pass('unauthenticated', false);
          }
        } catch (e) {
          const error = mapAnyError(e);
          error.log('Websocket');
          return pass('unauthenticated', false);
        }
      },
    };
  },
  inject: [Config, AuthGuard],
};
