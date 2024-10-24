import type {
  CanActivate,
  ExecutionContext,
  FactoryProvider,
  OnModuleInit,
} from '@nestjs/common';
import { Injectable, SetMetadata } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Socket } from 'socket.io';

import {
  AuthenticationRequired,
  Config,
  getRequestResponseFromContext,
  parseCookies,
} from '../../fundamentals';
import { WEBSOCKET_OPTIONS } from '../../fundamentals/websocket';
import { AuthService } from './service';
import { Session } from './session';

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

    const userSession = await this.signIn(req, res);
    if (res && userSession && userSession.expiresAt) {
      await this.auth.refreshUserSessionIfNeeded(res, userSession);
    }

    // api is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ENTRYPOINT_SYMBOL,
      [context.getClass(), context.getHandler()]
    );

    if (isPublic) {
      return true;
    }

    if (!userSession) {
      throw new AuthenticationRequired();
    }

    return true;
  }

  async signIn(req: Request, res?: Response): Promise<Session | null> {
    if (req.session) {
      return req.session;
    }

    // TODO(@forehalo): a cache for user session
    const userSession = await this.auth.getUserSessionFromRequest(req, res);

    if (userSession) {
      req.session = {
        ...userSession.session,
        user: userSession.user,
      };

      return req.session;
    }

    return null;
  }
}

/**
 * Mark api to be public accessible
 */
export const Public = () => SetMetadata(PUBLIC_ENTRYPOINT_SYMBOL, true);

export const AuthWebsocketOptionsProvider: FactoryProvider = {
  provide: WEBSOCKET_OPTIONS,
  useFactory: (config: Config, guard: AuthGuard) => {
    return {
      ...config.websocket,
      canActivate: async (socket: Socket) => {
        const upgradeReq = socket.client.request as Request;
        const handshake = socket.handshake;

        // compatibility with websocket request
        parseCookies(upgradeReq);

        upgradeReq.cookies = {
          [AuthService.sessionCookieName]: handshake.auth.token,
          [AuthService.userCookieName]: handshake.auth.userId,
          ...upgradeReq.cookies,
        };

        const session = await guard.signIn(upgradeReq);

        return !!session;
      },
    };
  },
  inject: [Config, AuthGuard],
};
