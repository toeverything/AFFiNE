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
  checkCanaryDateClientVersion,
  Config,
  CryptoHelper,
  getClientVersionFromRequest,
  getRequestResponseFromContext,
  parseCookies,
  UnsupportedClientVersion,
} from '../../base';
import { WEBSOCKET_OPTIONS } from '../../base/websocket';
import {
  extractTokenFromHeader,
  getSessionOptionsFromRequest,
  SessionIdSchema,
} from './input';
import { isLikelyJwt, JwtSessionService } from './jwt-session';
import { AuthService } from './service';
import { Session, TokenSession } from './session';

const PUBLIC_ENTRYPOINT_SYMBOL = Symbol('public');
const INTERNAL_ENTRYPOINT_SYMBOL = Symbol('internal');
const INTERNAL_ACCESS_TOKEN_TTL_MS = 5 * 60 * 1000;
const INTERNAL_ACCESS_TOKEN_CLOCK_SKEW_MS = 30 * 1000;

type AuthenticatedRequestSession =
  | { type: 'jwt'; session: Session }
  | { type: 'cookie_session'; session: Session }
  | { type: 'legacy_bearer_session'; session: Session }
  | { type: 'access_token'; token: TokenSession };

@Injectable()
export class AuthGuard implements CanActivate, OnModuleInit {
  private auth!: AuthService;
  private jwtSession!: JwtSessionService;
  private readonly cachedVersionRange = new Map<string, semver.Range | null>();
  private static readonly HARD_REQUIRED_VERSION = '>=0.25.0';
  private static readonly CANARY_REQUIRED_VERSION = 'canary (within 2 months)';

  constructor(
    private readonly crypto: CryptoHelper,
    private readonly cache: Cache,
    private readonly config: Config,
    private readonly ref: ModuleRef,
    private readonly reflector: Reflector
  ) {}

  onModuleInit() {
    this.auth = this.ref.get(AuthService, { strict: false });
    this.jwtSession = this.ref.get(JwtSessionService, { strict: false });
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
    const result = await this.resolveRequestSession(req, res, isPublic);
    return result?.type === 'access_token'
      ? result.token
      : (result?.session ?? null);
  }

  private async resolveRequestSession(
    req: Request,
    res?: Response,
    isPublic = false
  ): Promise<AuthenticatedRequestSession | null> {
    const bearer = req.headers.authorization
      ? extractTokenFromHeader(req.headers.authorization)
      : undefined;
    let ignoredInvalidPublicJwt = false;

    if (bearer && isLikelyJwt(bearer)) {
      try {
        const session = await this.signInWithJwt(req, bearer, res, isPublic);
        return session ? { type: 'jwt', session } : null;
      } catch (err) {
        if (!isPublic) throw err;
        ignoredInvalidPublicJwt = true;
      }
    }

    if (bearer && !ignoredInvalidPublicJwt) {
      // Legacy auth compatibility: old clients may still send opaque session ids as bearer tokens.
      const legacyBearerSession = await this.signInWithSessionId(
        req,
        bearer,
        res,
        isPublic
      );
      if (legacyBearerSession) {
        return { type: 'legacy_bearer_session', session: legacyBearerSession };
      }
      const token = await this.signInWithAccessToken(req);
      return token ? { type: 'access_token', token } : null;
    }

    const session = await this.signInWithCookie(req, res, isPublic);
    return session ? { type: 'cookie_session', session } : null;
  }

  async signInWithJwt(
    req: Request,
    token: string,
    res?: Response,
    isPublic = false
  ): Promise<Session | null> {
    if (req.session && req.authType === 'jwt') return req.session;
    const session = await this.jwtSession.verify(token);
    const versionAllowed = await this.checkUserSessionClientVersion(
      req,
      session,
      res,
      isPublic
    );
    if (!versionAllowed) return null;
    req.session = session;
    req.authType = 'jwt';
    return req.session;
  }

  async signInWithSessionId(
    req: Request,
    sessionId: string,
    res?: Response,
    isPublic = false
  ): Promise<Session | null> {
    if (req.session && req.session.sessionId === sessionId) return req.session;
    const parsedSessionId = SessionIdSchema.safeParse(sessionId);
    if (!parsedSessionId.success) return null;

    const { userId } = getSessionOptionsFromRequest(req);
    const userSession = await this.auth.getUserSession(
      parsedSessionId.data,
      userId
    );

    if (!userSession) return null;
    req.session = { ...userSession.session, user: userSession.user };
    const versionAllowed = await this.checkUserSessionClientVersion(
      req,
      req.session,
      res,
      isPublic
    );
    if (!versionAllowed) {
      req.session = undefined;
      return null;
    }
    req.authType = 'session';

    return req.session;
  }

  async signInWithCookie(
    req: Request,
    res?: Response,
    isPublic = false
  ): Promise<Session | null> {
    if (req.session) return req.session;

    // TODO(@forehalo): a cache for user session
    const userSession = await this.auth.getUserSessionFromRequest(req, res);

    if (userSession) {
      const headerClientVersion = getClientVersionFromRequest(req);
      req.session = { ...userSession.session, user: userSession.user };

      const versionAllowed = await this.checkUserSessionClientVersion(
        req,
        req.session,
        res,
        isPublic
      );
      if (!versionAllowed) {
        req.session = undefined;
        return null;
      }

      if (res) {
        await this.auth.refreshUserSessionIfNeeded(
          res,
          userSession.session,
          undefined,
          headerClientVersion
        );
      }

      req.authType = 'session';

      return req.session;
    }

    return null;
  }

  private async checkUserSessionClientVersion(
    req: Request,
    session: Session,
    res?: Response,
    isPublic = false
  ) {
    if (!this.config.client.versionControl.enabled) {
      return true;
    }

    const headerClientVersion = getClientVersionFromRequest(req);
    const clientVersion =
      headerClientVersion ??
      session.refreshClientVersion ??
      session.signInClientVersion;

    const versionCheckResult = this.checkClientVersion(clientVersion);
    if (versionCheckResult.ok) {
      return true;
    }

    await this.auth.signOut(session.sessionId);
    if (res) {
      await this.auth.refreshCookies(res, session.sessionId);
    }

    if (isPublic) {
      return false;
    }

    throw new UnsupportedClientVersion({
      clientVersion: clientVersion ?? 'unset_or_invalid',
      requiredVersion: versionCheckResult.requiredVersion,
    });
  }

  async signInWithAccessToken(req: Request): Promise<TokenSession | null> {
    if (req.token) {
      return req.token;
    }

    const tokenSession = await this.auth.getTokenSessionFromRequest(req);

    if (tokenSession) {
      req.token = { ...tokenSession.token, user: tokenSession.user };
      req.authType = 'access_token';

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

    if (clientVersion && env.namespaces.canary) {
      const canaryCheck = checkCanaryDateClientVersion(clientVersion);
      if (canaryCheck.matched) {
        return canaryCheck.allowed
          ? { ok: true }
          : { ok: false, requiredVersion: AuthGuard.CANARY_REQUIRED_VERSION };
      }
    }

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

        if (handshake.auth.tokenType === 'jwt') {
          upgradeReq.headers.authorization = `Bearer ${handshake.auth.token}`;
        }

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
