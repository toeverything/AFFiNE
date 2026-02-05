import type {
  CanActivate,
  ExecutionContext,
  FactoryProvider,
  OnModuleInit,
} from '@nestjs/common';
import { Injectable, SetMetadata } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import semver from 'semver';
import { Socket } from 'socket.io';

import {
  AccessDenied,
  AuthenticationRequired,
  Cache,
  Config,
  CryptoHelper,
  getClientVersionFromRequest,
  getRequestResponseFromContext,
  parseCookies,
  UnsupportedClientVersion,
} from '../../base';
import { WEBSOCKET_OPTIONS } from '../../base/websocket';
import { AuthService } from './service';
import { Session, TokenSession } from './session';

const PUBLIC_ENTRYPOINT_SYMBOL = Symbol('public');
const INTERNAL_ENTRYPOINT_SYMBOL = Symbol('internal');
const INTERNAL_ACCESS_TOKEN_TTL_MS = 5 * 60 * 1000;
const INTERNAL_ACCESS_TOKEN_CLOCK_SKEW_MS = 30 * 1000;

@Injectable()
export class AuthGuard implements CanActivate, OnModuleInit {
  private auth!: AuthService;
  private readonly cachedVersionRange = new Map<string, semver.Range | null>();
  private static readonly HARD_REQUIRED_VERSION = '>=0.25.0';

  constructor(
    private readonly crypto: CryptoHelper,
    private readonly cache: Cache,
    private readonly config: Config,
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
      const accessToken = req.get('x-access-token');
      if (accessToken) {
        const payload = this.crypto.parseInternalAccessToken(accessToken);
        if (payload) {
          const now = Date.now();
          const method = req.method.toUpperCase();
          const path = req.path;

          const timestampInRange =
            payload.ts <= now + INTERNAL_ACCESS_TOKEN_CLOCK_SKEW_MS &&
            now - payload.ts <= INTERNAL_ACCESS_TOKEN_TTL_MS;

          if (timestampInRange && payload.m === method && payload.p === path) {
            const nonceKey = `rpc:nonce:${payload.nonce}`;
            const ok = await this.cache.setnx(nonceKey, 1, {
              ttl: INTERNAL_ACCESS_TOKEN_TTL_MS,
            });
            if (ok) {
              return true;
            }
          }
        }
      }
      throw new AccessDenied('Invalid internal request');
    }

    // api is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ENTRYPOINT_SYMBOL,
      [clazz, handler]
    );

    const authedUser = await this.signIn(req, res, isPublic);

    if (isPublic) {
      return true;
    }

    if (!authedUser) {
      throw new AuthenticationRequired();
    }

    return true;
  }

  async signIn(
    req: Request,
    res?: Response,
    isPublic = false
  ): Promise<Session | TokenSession | null> {
    const userSession = await this.signInWithCookie(req, res, isPublic);
    if (userSession) {
      return userSession;
    }

    return await this.signInWithAccessToken(req);
  }

  async signInWithCookie(
    req: Request,
    res?: Response,
    isPublic = false
  ): Promise<Session | null> {
    if (req.session) {
      return req.session;
    }

    // TODO(@forehalo): a cache for user session
    const userSession = await this.auth.getUserSessionFromRequest(req, res);

    if (userSession) {
      const headerClientVersion = getClientVersionFromRequest(req);
      if (this.config.client.versionControl.enabled) {
        const clientVersion =
          headerClientVersion ??
          userSession.session.refreshClientVersion ??
          userSession.session.signInClientVersion;

        const versionCheckResult = this.checkClientVersion(clientVersion);
        if (!versionCheckResult.ok) {
          await this.auth.signOut(userSession.session.sessionId);
          if (res) {
            await this.auth.refreshCookies(res, userSession.session.sessionId);
          }

          if (isPublic) {
            return null;
          }

          throw new UnsupportedClientVersion({
            clientVersion: clientVersion ?? 'unset_or_invalid',
            requiredVersion: versionCheckResult.requiredVersion,
          });
        }
      }

      if (res) {
        await this.auth.refreshUserSessionIfNeeded(
          res,
          userSession.session,
          undefined,
          headerClientVersion
        );
      }

      req.session = {
        ...userSession.session,
        user: userSession.user,
      };

      return req.session;
    }

    return null;
  }

  async signInWithAccessToken(req: Request): Promise<TokenSession | null> {
    if (req.token) {
      return req.token;
    }

    const tokenSession = await this.auth.getTokenSessionFromRequest(req);

    if (tokenSession) {
      req.token = {
        ...tokenSession.token,
        user: tokenSession.user,
      };

      return req.token;
    }

    return null;
  }

  private getVersionRange(versionRange: string): semver.Range | null {
    if (this.cachedVersionRange.has(versionRange)) {
      // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion
      return this.cachedVersionRange.get(versionRange)!;
    }

    let range: semver.Range | null = null;
    try {
      range = new semver.Range(versionRange, { loose: false });
      if (!semver.validRange(range)) {
        range = null;
      }
    } catch {
      range = null;
    }

    this.cachedVersionRange.set(versionRange, range);
    return range;
  }

  private checkClientVersion(
    clientVersion?: string | null
  ): { ok: true } | { ok: false; requiredVersion: string } {
    const requiredVersion = this.config.client.versionControl.requiredVersion;

    const configRange = this.getVersionRange(requiredVersion);
    if (
      configRange &&
      (!clientVersion ||
        !semver.satisfies(clientVersion, configRange, {
          includePrerelease: true,
        }))
    ) {
      return { ok: false, requiredVersion };
    }

    const hardRange = this.getVersionRange(AuthGuard.HARD_REQUIRED_VERSION);
    if (!hardRange) {
      return { ok: true };
    }

    if (
      !clientVersion ||
      !semver.satisfies(clientVersion, hardRange, {
        includePrerelease: true,
      })
    ) {
      return { ok: false, requiredVersion: AuthGuard.HARD_REQUIRED_VERSION };
    }

    return { ok: true };
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

        const session = await (async () => {
          try {
            return await guard.signIn(upgradeReq);
          } catch {
            return null;
          }
        })();

        return !!session;
      },
    };
  },
  inject: [Config, AuthGuard],
};
