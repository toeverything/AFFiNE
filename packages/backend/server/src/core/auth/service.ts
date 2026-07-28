import { randomUUID } from 'node:crypto';

import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { CookieOptions, Request, Response } from 'express';
import { assign, pick } from 'lodash-es';

import { Config, OnEvent, SignUpForbidden } from '../../base';
import { Models, type User, type UserSession } from '../../models';
import { EntitlementService } from '../entitlement';
import { Mailer } from '../mail/mailer';
import type { MailDeliveryMetadata } from '../mail/types';
import { AuthSessionService } from './auth-session';
import { createDevUsers } from './dev';
import type { VerifiedIdentity } from './identity';
import {
  CSRF_COOKIE_NAME,
  getSessionOptionsFromRequest,
  SESSION_COOKIE_NAME,
  USER_COOKIE_NAME,
} from './input';
import type { CurrentUser } from './session';

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
    private readonly mailer: Mailer,
    private readonly authSessions: AuthSessionService,
    private readonly entitlement: EntitlementService
  ) {
    this.cookieOptions = {
      sameSite: 'lax',
      httpOnly: true,
      path: '/',
      secure: this.config.server.https,
    };
  }

  private getServerName() {
    return (
      this.config.server.name ??
      (env.selfhosted ? 'AFFiNE Self-hosted' : 'AFFiNE Cloud')
    );
  }

  async onApplicationBootstrap() {
    if (env.dev) {
      await createDevUsers(this.models, this.entitlement);
    }
  }

  async canSignIn(_email: string) {
    // may add more sign-in check later
    return true;
  }

  /**
   * @deprecated
   *
   * This is a test only helper to quickly signup a user, do not use in production
   */
  async signUp(email: string, password: string): Promise<CurrentUser> {
    if (!env.testing) {
      throw new SignUpForbidden(
        'sign up helper is forbidden for non-test environment'
      );
    }

    return this.models.user
      .create({
        email,
        password,
      })
      .then(sessionUser);
  }

  async signIn(email: string, password: string): Promise<CurrentUser> {
    return this.models.user.signIn(email, password).then(sessionUser);
  }

  async verifyPassword(
    email: string,
    password: string
  ): Promise<VerifiedIdentity> {
    const user = await this.models.user.signIn(email, password);
    return { userId: user.id, method: 'password' };
  }

  async signOut(sessionId: string, userId?: string) {
    // sign out all users in the session
    if (!userId) {
      await this.models.session.deleteSession(sessionId);
    } else {
      await this.models.session.deleteUserSessions(userId, sessionId);
    }
  }

  async getUserSession(
    sessionId: string,
    userId?: string
  ): Promise<{ user: CurrentUser; session: UserSession } | null> {
    const sessions = await this.getUserSessions(sessionId);
    if (!sessions.length) return null;

    let userSession: UserSession | undefined;

    // try read from user provided cookies.userId
    if (userId) {
      userSession = sessions.find(s => s.userId === userId);
    }

    // fallback to the first valid session if user provided userId is invalid
    if (!userSession) {
      // checked
      // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion
      userSession = sessions.at(-1)!;
    }

    const user = await this.models.user.get(userSession.userId);

    if (!user) {
      return null;
    }

    return { user: sessionUser(user), session: userSession };
  }

  async getUserSessions(sessionId: string) {
    return await this.models.session.findUserSessionsBySessionId(sessionId);
  }

  async createUserSession(
    userId: string,
    sessionId?: string,
    ttl?: number,
    signInClientVersion?: string
  ) {
    return await this.models.session.createOrRefreshUserSession(
      userId,
      sessionId,
      ttl,
      signInClientVersion
    );
  }

  async getUserList(sessionId: string) {
    const sessions = await this.models.session.findUserSessionsBySessionId(
      sessionId,
      {
        user: true,
      }
    );
    return sessions.map(({ user }) => sessionUser(user));
  }

  async createSession() {
    return await this.models.session.createSession();
  }

  async getSession(sessionId: string) {
    return await this.models.session.getSession(sessionId);
  }

  async refreshUserSessionIfNeeded(
    res: Response,
    userSession: UserSession,
    ttr?: number,
    refreshClientVersion?: string
  ): Promise<boolean> {
    const newExpiresAt = await this.models.session.refreshUserSessionIfNeeded(
      userSession,
      ttr,
      refreshClientVersion
    );
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

  @Transactional()
  async revokeUserSessions(userId: string, reason = 'security_action') {
    const authSessions = await this.authSessions.revokeUserSessions(
      userId,
      reason
    );
    const cookieSessions = await this.models.session.deleteUserSessions(userId);
    return cookieSessions + authSessions;
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

  async changePassword(
    id: string,
    newPassword: string
  ): Promise<Omit<User, 'password'>> {
    return this.models.user.update(id, { password: newPassword });
  }

  @Transactional()
  async changePasswordAndRevokeSessions(id: string, newPassword: string) {
    const user = await this.changePassword(id, newPassword);
    await this.revokeUserSessions(id);
    return user;
  }

  async changeEmail(
    id: string,
    newEmail: string
  ): Promise<Omit<User, 'password'>> {
    return this.models.user.update(id, {
      email: newEmail,
      emailVerifiedAt: new Date(),
    });
  }

  @Transactional()
  async changeEmailAndRevokeSessions(id: string, newEmail: string) {
    const user = await this.changeEmail(id, newEmail);
    await this.revokeUserSessions(id);
    return user;
  }

  async setEmailVerified(id: string) {
    return await this.models.user.update(id, {
      emailVerifiedAt: new Date(),
    });
  }

  async sendChangePasswordEmail(
    email: string,
    callbackUrl: string,
    metadata?: MailDeliveryMetadata
  ) {
    return await this.mailer.send({
      name: 'ChangePassword',
      to: email,
      props: {
        url: callbackUrl,
      },
      metadata,
    });
  }
  async sendSetPasswordEmail(
    email: string,
    callbackUrl: string,
    metadata?: MailDeliveryMetadata
  ) {
    return await this.mailer.send({
      name: 'SetPassword',
      to: email,
      props: {
        url: callbackUrl,
      },
      metadata,
    });
  }
  async sendChangeEmail(
    email: string,
    callbackUrl: string,
    metadata?: MailDeliveryMetadata
  ) {
    return await this.mailer.send({
      name: 'ChangeEmail',
      to: email,
      props: {
        url: callbackUrl,
      },
      metadata,
    });
  }
  async sendVerifyChangeEmail(
    email: string,
    callbackUrl: string,
    metadata?: MailDeliveryMetadata
  ) {
    return await this.mailer.send({
      name: 'VerifyChangeEmail',
      to: email,
      props: {
        url: callbackUrl,
      },
      metadata,
    });
  }
  async sendVerifyEmail(
    email: string,
    callbackUrl: string,
    metadata?: MailDeliveryMetadata
  ) {
    return await this.mailer.send({
      name: 'VerifyEmail',
      to: email,
      props: {
        url: callbackUrl,
      },
      metadata,
    });
  }
  async sendNotificationChangeEmail(email: string) {
    return await this.mailer.send({
      name: 'EmailChanged',
      to: email,
      props: {
        to: email,
      },
    });
  }

  async sendSignInEmail(
    email: string,
    link: string,
    otp: string,
    signUp: boolean,
    metadata?: MailDeliveryMetadata
  ) {
    return await this.mailer.send({
      name: signUp ? 'SignUp' : 'SignIn',
      to: email,
      props: {
        url: link,
        otp,
        serverName: this.getServerName(),
      },
      metadata,
    });
  }
}
