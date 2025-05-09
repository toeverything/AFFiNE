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
  AccessDenied,
  AuthenticationRequired,
  Config,
  CryptoHelper,
  getRequestResponseFromContext,
  parseCookies,
} from '../../base';
import { WEBSOCKET_OPTIONS } from '../../base/websocket';
import { AuthService } from './service';
import { Session } from './session';

const PUBLIC_ENTRYPOINT_SYMBOL = Symbol('public');
const INTERNAL_ENTRYPOINT_SYMBOL = Symbol('internal');

@Injectable()
export class AuthGuard implements CanActivate, OnModuleInit {
  private auth!: AuthService;

  constructor(
    private readonly crypto: CryptoHelper,
    private readonly ref: ModuleRef,
    private readonly reflector: Reflector
  ) {}

  onModuleInit() {
    this.auth = this.ref.get(AuthService, { strict: false });
  }

  async canActivate(context: ExecutionContext) {
    const { req, res } = getRequestResponseFromContext(context);
    const clazz = context.getClass();
    const handler = context.getHandler();
    // rpc request is internal
    const isInternal = this.reflector.getAllAndOverride<boolean>(
      INTERNAL_ENTRYPOINT_SYMBOL,
      [clazz, handler]
    );
    if (isInternal) {
      // check access token: data,signature
      const accessToken = req.get('x-access-token');
      if (accessToken && this.crypto.verify(accessToken)) {
        return true;
      }
      throw new AccessDenied('Invalid internal request');
    }

    const userSession = await this.signIn(req, res);
    if (res && userSession && userSession.expiresAt) {
      await this.auth.refreshUserSessionIfNeeded(res, userSession);
    }

    // api is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ENTRYPOINT_SYMBOL,
      [clazz, handler]
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

/**
 * Mark rpc api to be internal accessible
 */
export const Internal = () => SetMetadata(INTERNAL_ENTRYPOINT_SYMBOL, true);

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
