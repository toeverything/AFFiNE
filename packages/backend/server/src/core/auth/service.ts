import { createHash, randomUUID } from 'node:crypto';

import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { UserSession } from '@prisma/client';
import type { CookieOptions, Request, Response } from 'express';
import { assign, pick } from 'lodash-es';

import {
  Cache,
  Config,
  EmailAlreadyUsed,
  EmailVerificationRequired,
  EventBus,
  getRequestClientIp,
  InvalidEmailToken,
  OnEvent,
  SameEmailProvided,
  TooManyRequest,
  WrongSignInCredentials,
  WrongSignInMethod,
} from '../../base';
import { Models, type User } from '../../models';
import {
  BackendRuntimeProvider,
  type RuntimeQuotaSourceInput,
} from '../backend-runtime';
import { EntitlementService } from '../entitlement';
import { AuthSessionService } from './auth-session';
import { resolveCookiePrincipal } from './cookie-session';
import { createDevUsers } from './dev';
import {
  CSRF_COOKIE_NAME,
  getSessionOptionsFromRequest,
  SESSION_COOKIE_NAME,
  USER_COOKIE_NAME,
} from './input';
import type { CurrentUser } from './session';
import type { NativeLoginResult, SessionIssueInput } from './session-issuer';

export function sessionUser(
  user: Pick<
    User,
    'id' | 'email' | 'avatarUrl' | 'name' | 'emailVerifiedAt' | 'disabled'
  > & { password?: string | null }
): CurrentUser {
  // use pick to avoid unexpected fields
  return assign(pick(user, 'id', 'email', 'avatarUrl', 'name', 'disabled'), {
    hasPassword: user.password !== null,
    emailVerified: user.emailVerifiedAt !== null,
  });
}

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  readonly cookieOptions: CookieOptions;
  static readonly sessionCookieName = SESSION_COOKIE_NAME;
  static readonly userCookieName = USER_COOKIE_NAME;
  static readonly csrfCookieName = CSRF_COOKIE_NAME;

  constructor(
    private readonly config: Config,
    private readonly models: Models,
    private readonly authSessions: AuthSessionService,
    private readonly entitlement: EntitlementService,
    private readonly cache: Cache,
    private readonly rt: BackendRuntimeProvider,
    private readonly event: EventBus
  ) {
    this.cookieOptions = {
      sameSite: 'lax',
      httpOnly: true,
      path: '/',
      secure: this.config.server.https,
    };
  }

  async onApplicationBootstrap() {
    if (env.dev) {
      await createDevUsers(this.models, this.entitlement);
    }
  }

  async canSignIn(email: string, req: Request) {
    if (!env.testing) {
      const { ttl, ipLimit, emailLimit } = this.config.auth.signInRateLimit;
      const normalizedEmail = email.toLowerCase();
      const ip = getRequestClientIp(req);

      const emailAttempts = this.cache.increaseWithTtl(
        this.signInRateLimitKey('email', normalizedEmail),
        ttl
      );
      const ipAttempts = ip
        ? this.cache.increaseWithTtl(this.signInRateLimitKey('ip', ip), ttl)
        : Promise.resolve(0);
      const [emailCount, ipCount] = await Promise.all([
        emailAttempts,
        ipAttempts,
      ]);

      if (emailCount > emailLimit || ipCount > ipLimit) {
        throw new TooManyRequest();
      }
    }

    // may add more sign-in check later
    return true;
  }

  private signInRateLimitKey(scope: 'email' | 'ip', value: string) {
    const digest = createHash('sha256').update(value).digest('hex');
    return `auth:sign-in-rate:${scope}:${digest}`;
  }

  requestSource(req?: Request): RuntimeQuotaSourceInput {
    if (!req || !this.config.auth.trustedCloudflareHeaders) {
      return { trusted: false };
    }
    const rawAsn = req.get('x-affine-cf-asn');
    const asn = rawAsn ? Number(rawAsn) : undefined;
    return {
      trusted: true,
      ip: getRequestClientIp(req),
      country: req.get('CF-IPCountry')?.trim() || undefined,
      asn:
        asn !== undefined &&
        Number.isSafeInteger(asn) &&
        asn > 0 &&
        asn <= 0xffffffff
          ? asn
          : undefined,
      rayId: req.get('CF-Ray')?.trim() || undefined,
    };
  }

  async passwordLogin(
    email: string,
    password: string,
    issue: SessionIssueInput
  ): Promise<NativeLoginResult> {
    try {
      return await this.rt.executeAuthSessionCommandV1<NativeLoginResult>({
        action: 'password_login',
        email,
        password,
        issue,
      });
    } catch (error) {
      if (String(error).includes('wrong_sign_in_method')) {
        throw new WrongSignInMethod();
      }
      if (String(error).includes('wrong_sign_in_credentials')) {
        throw new WrongSignInCredentials({ email });
      }
      throw error;
    }
  }

  async issueUser(userId: string, issue: SessionIssueInput) {
    return await this.rt.executeAuthSessionCommandV1<NativeLoginResult>({
      action: 'issue_user',
      userId,
      issue,
    });
  }

  async signOut(sessionId: string, userId?: string) {
    await this.rt.executeAuthSessionCommandV1({
      action: 'cookie_sign_out',
      sessionId,
      userId,
    });
  }

  async getUserSession(
    sessionId: string,
    userId?: string
  ): Promise<{ user: CurrentUser; session: UserSession } | null> {
    const result = await resolveCookiePrincipal(
      this.rt,
      sessionId,
      userId,
      false
    );
    return result.status === 'valid'
      ? { user: result.principal.user, session: result.principal }
      : null;
  }

  async getUserList(sessionId: string) {
    return await this.rt.executeAuthSessionCommandV1<CurrentUser[]>({
      action: 'cookie_users',
      sessionId,
    });
  }

  async refreshUserSessionIfNeeded(
    res: Response,
    userSession: UserSession,
    _ttr?: number,
    refreshClientVersion?: string
  ): Promise<boolean> {
    const result = await resolveCookiePrincipal(
      this.rt,
      userSession.sessionId,
      userSession.userId,
      true,
      refreshClientVersion
    );
    const newExpiresAt =
      result.status === 'valid' && result.refreshedExpiresAt
        ? new Date(result.refreshedExpiresAt)
        : undefined;
    if (!newExpiresAt) {
      // no need to refresh
      return false;
    }

    res.cookie(AuthService.sessionCookieName, userSession.sessionId, {
      expires: newExpiresAt,
      ...this.cookieOptions,
    });
    res.cookie(AuthService.csrfCookieName, randomUUID(), {
      expires: newExpiresAt,
      ...this.cookieOptions,
      httpOnly: false,
    });

    return true;
  }

  async revokeUserSessions(userId: string, reason = 'security_action') {
    return await this.authSessions.revokeUserSessions(userId, reason);
  }

  @OnEvent('auth.sessions.revoke_requested')
  async onRevokeRequested({
    userId,
    reason,
  }: Events['auth.sessions.revoke_requested']) {
    await this.revokeUserSessions(userId, reason);
  }

  async refreshCookies(res: Response, sessionId?: string) {
    if (sessionId) {
      const users = await this.getUserList(sessionId);
      const candidateUser = users.at(-1);

      if (candidateUser) {
        this.setUserCookie(res, candidateUser.id);
        return;
      }
    }

    this.clearCookies(res);
  }

  clearCookies(res: Response<any, Record<string, any>>) {
    res.clearCookie(AuthService.sessionCookieName);
    res.clearCookie(AuthService.userCookieName);
    res.clearCookie(AuthService.csrfCookieName);
  }

  setUserCookie(res: Response, userId: string) {
    res.cookie(AuthService.userCookieName, userId, {
      ...this.cookieOptions,
      // user cookie is client readable & writable for fast user switch if there are multiple users in one session
      // it safe to be non-secure & non-httpOnly because server will validate it by `cookie[AuthService.sessionCookieName]`
      httpOnly: false,
      secure: false,
    });
  }

  async getUserSessionFromRequest(req: Request, res?: Response) {
    const { sessionId, userId } = getSessionOptionsFromRequest(req);
    if (!sessionId) return null;
    const session = await this.getUserSession(sessionId, userId);

    if (res) {
      if (session) {
        // set user id cookie for fast authentication
        if (!userId || userId !== session.user.id) {
          this.setUserCookie(res, session.user.id);
        }
      } else if (sessionId) {
        // clear invalid cookies.session and cookies.userId
        this.clearCookies(res);
      }
    }

    return session;
  }

  async prepareSecurityChallenge(
    kind: 'change_password' | 'set_password' | 'change_email' | 'verify_email',
    userId: string,
    callbackUrl: string,
    source?: RuntimeQuotaSourceInput
  ) {
    return await this.securityCommand({
      action: 'prepare_security_challenge',
      kind,
      userId,
      callbackUrl,
      source,
    });
  }

  async prepareVerifyChangeEmail(
    userId: string,
    token: string,
    email: string,
    callbackUrl: string,
    source?: RuntimeQuotaSourceInput
  ) {
    return await this.securityCommand({
      action: 'prepare_verify_change_email',
      userId,
      token,
      email,
      callbackUrl,
      source,
    });
  }

  async completePasswordChallenge(
    userId: string,
    token: string,
    password: string
  ) {
    const result = await this.securityCommand({
      action: 'complete_password_challenge',
      userId,
      token,
      password,
    });
    const user = await this.models.user.get(userId, { withDisabled: true });
    if (user) this.event.emitDetached('user.updated', user);
    return result;
  }

  async completeEmailChallenge(userId: string, token: string, email: string) {
    const result = await this.securityCommand({
      action: 'complete_email_challenge',
      userId,
      token,
      email,
    });
    const user = await this.models.user.get(userId, { withDisabled: true });
    if (user) this.event.emitDetached('user.updated', user);
    return result;
  }

  async completeVerifyEmailChallenge(userId: string, token: string) {
    return await this.securityCommand({
      action: 'complete_verify_email_challenge',
      userId,
      token,
    });
  }

  async createSecurityUrl(
    kind: 'change_password' | 'set_password' | 'change_email' | 'verify_email',
    userId: string,
    callbackUrl: string
  ) {
    return await this.securityCommand<string>({
      action: 'create_security_url',
      kind,
      userId,
      callbackUrl,
    });
  }

  private async securityCommand<T = boolean>(command: Record<string, unknown>) {
    try {
      return await this.rt.executeAuthSessionCommandV1<T>(command);
    } catch (error) {
      const message = String(error);
      if (message.includes('email_verification_required'))
        throw new EmailVerificationRequired();
      if (
        message.includes('email_already_used') ||
        message.includes('users_email_key')
      )
        throw new EmailAlreadyUsed();
      if (message.includes('same_email_provided'))
        throw new SameEmailProvided();
      if (message.includes('invalid_email_token'))
        throw new InvalidEmailToken();
      if (message.includes('mail_quota_denied')) throw new TooManyRequest();
      throw error;
    }
  }
}
