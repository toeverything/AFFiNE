import {
  BadRequestException,
  Injectable,
  NotAcceptableException,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { PrismaClient, type User } from '@prisma/client';
import type { CookieOptions, Request, Response } from 'express';
import { assign, omit } from 'lodash-es';

import {
  Config,
  CryptoHelper,
  MailService,
  SessionCache,
} from '../../fundamentals';
import { FeatureManagementService } from '../features/management';
import { UserService } from '../user/service';
import type { CurrentUser } from './current-user';

export function parseAuthUserSeqNum(value: any) {
  switch (typeof value) {
    case 'number': {
      return value;
    }
    case 'string': {
      value = Number.parseInt(value);
      return Number.isNaN(value) ? 0 : value;
    }

    default: {
      return 0;
    }
  }
}

export function sessionUser(
  user: Pick<
    User,
    'id' | 'email' | 'avatarUrl' | 'name' | 'emailVerifiedAt'
  > & { password?: string | null }
): CurrentUser {
  return assign(
    omit(user, 'password', 'registered', 'emailVerifiedAt', 'createdAt'),
    {
      hasPassword: user.password !== null,
      emailVerified: user.emailVerifiedAt !== null,
    }
  );
}

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  readonly cookieOptions: CookieOptions = {
    sameSite: 'lax',
    httpOnly: true,
    path: '/',
    domain: this.config.host,
    secure: this.config.https,
  };
  static readonly sessionCookieName = 'sid';
  static readonly authUserSeqHeaderName = 'x-auth-user';

  constructor(
    private readonly config: Config,
    private readonly db: PrismaClient,
    private readonly mailer: MailService,
    private readonly feature: FeatureManagementService,
    private readonly user: UserService,
    private readonly crypto: CryptoHelper,
    private readonly cache: SessionCache
  ) {}

  async onApplicationBootstrap() {
    if (this.config.node.dev) {
      await this.signUp('Dev User', 'dev@affine.pro', 'dev').catch(() => {
        // ignore
      });
    }
  }

  canSignIn(email: string) {
    return this.feature.canEarlyAccess(email);
  }

  async signUp(
    name: string,
    email: string,
    password: string
  ): Promise<CurrentUser> {
    const user = await this.getUserByEmail(email);

    if (user) {
      throw new BadRequestException('Email was taken');
    }

    const hashedPassword = await this.crypto.encryptPassword(password);

    return this.user
      .createUser({
        name,
        email,
        password: hashedPassword,
      })
      .then(sessionUser);
  }

  async signIn(email: string, password: string) {
    const user = await this.user.findUserWithHashedPasswordByEmail(email);

    if (!user) {
      throw new NotFoundException('User Not Found');
    }

    if (!user.password) {
      throw new NotAcceptableException(
        'User Password is not set. Should login throw email link.'
      );
    }

    const passwordMatches = await this.crypto.verifyPassword(
      password,
      user.password
    );

    if (!passwordMatches) {
      throw new NotAcceptableException('Incorrect Password');
    }

    return sessionUser(user);
  }

  async getUserWithCache(token: string, seq = 0) {
    const cacheKey = `session:${token}:${seq}`;
    let user = await this.cache.get<CurrentUser | null>(cacheKey);
    if (user) {
      return user;
    }

    user = await this.getUser(token, seq);

    if (user) {
      await this.cache.set(cacheKey, user);
    }

    return user;
  }

  async getUser(token: string, seq = 0): Promise<CurrentUser | null> {
    const session = await this.getSession(token);

    // no such session
    if (!session) {
      return null;
    }

    const userSession = session.userSessions.at(seq);

    // no such user session
    if (!userSession) {
      return null;
    }

    // user session expired
    if (userSession.expiresAt && userSession.expiresAt <= new Date()) {
      return null;
    }

    const user = await this.db.user.findUnique({
      where: { id: userSession.userId },
    });

    if (!user) {
      return null;
    }

    return sessionUser(user);
  }

  async getUserList(token: string) {
    const session = await this.getSession(token);

    if (!session || !session.userSessions.length) {
      return [];
    }

    const users = await this.db.user.findMany({
      where: {
        id: {
          in: session.userSessions.map(({ userId }) => userId),
        },
      },
    });

    // TODO(@forehalo): need to separate expired session, same for [getUser]
    // Session
    //   | { user: LimitedUser { email, avatarUrl }, expired: true }
    //   | { user: User, expired: false }
    return users.map(sessionUser);
  }

  async signOut(token: string, seq = 0) {
    const session = await this.getSession(token);

    if (session) {
      // overflow the logged in user
      if (session.userSessions.length <= seq) {
        return session;
      }

      await this.db.userSession.deleteMany({
        where: { id: session.userSessions[seq].id },
      });

      // no more user session active, delete the whole session
      if (session.userSessions.length === 1) {
        await this.db.session.delete({ where: { id: session.id } });
        return null;
      }

      return session;
    }

    return null;
  }

  async getSession(token: string) {
    if (!token) {
      return null;
    }

    return this.db.$transaction(async tx => {
      const session = await tx.session.findUnique({
        where: {
          id: token,
        },
        include: {
          userSessions: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });

      if (!session) {
        return null;
      }

      if (session.expiresAt && session.expiresAt <= new Date()) {
        await tx.session.delete({
          where: {
            id: session.id,
          },
        });

        return null;
      }

      return session;
    });
  }

  async createUserSession(
    user: { id: string },
    existingSession?: string,
    ttl = this.config.auth.session.ttl
  ) {
    const session = existingSession
      ? await this.getSession(existingSession)
      : null;

    const expiresAt = new Date(Date.now() + ttl * 1000);
    if (session) {
      return this.db.userSession.upsert({
        where: {
          sessionId_userId: {
            sessionId: session.id,
            userId: user.id,
          },
        },
        update: {
          expiresAt,
        },
        create: {
          sessionId: session.id,
          userId: user.id,
          expiresAt,
        },
      });
    } else {
      return this.db.userSession.create({
        data: {
          expiresAt,
          session: {
            create: {},
          },
          user: {
            connect: {
              id: user.id,
            },
          },
        },
      });
    }
  }

  async setCookie(req: Request, res: Response, user: { id: string }) {
    const session = await this.createUserSession(
      user,
      req.cookies[AuthService.sessionCookieName]
    );

    res.cookie(AuthService.sessionCookieName, session.sessionId, {
      expires: session.expiresAt ?? void 0,
      ...this.cookieOptions,
    });
  }

  async getUserByEmail(email: string) {
    return this.user.findUserByEmail(email);
  }

  async changePassword(email: string, newPassword: string): Promise<User> {
    const user = await this.getUserByEmail(email);

    if (!user) {
      throw new BadRequestException('Invalid email');
    }

    const hashedPassword = await this.crypto.encryptPassword(newPassword);

    return this.db.user.update({
      where: {
        id: user.id,
      },
      data: {
        password: hashedPassword,
      },
    });
  }

  async changeEmail(id: string, newEmail: string): Promise<User> {
    const user = await this.db.user.findUnique({
      where: {
        id,
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid email');
    }

    return this.db.user.update({
      where: {
        id,
      },
      data: {
        email: newEmail,
        emailVerifiedAt: new Date(),
      },
    });
  }

  async setEmailVerified(id: string) {
    return await this.db.user.update({
      where: {
        id,
      },
      data: {
        emailVerifiedAt: new Date(),
      },
      select: {
        emailVerifiedAt: true,
      },
    });
  }

  async sendChangePasswordEmail(email: string, callbackUrl: string) {
    return this.mailer.sendChangePasswordEmail(email, callbackUrl);
  }
  async sendSetPasswordEmail(email: string, callbackUrl: string) {
    return this.mailer.sendSetPasswordEmail(email, callbackUrl);
  }
  async sendChangeEmail(email: string, callbackUrl: string) {
    return this.mailer.sendChangeEmail(email, callbackUrl);
  }
  async sendVerifyChangeEmail(email: string, callbackUrl: string) {
    return this.mailer.sendVerifyChangeEmail(email, callbackUrl);
  }
  async sendVerifyEmail(email: string, callbackUrl: string) {
    return this.mailer.sendVerifyEmail(email, callbackUrl);
  }
  async sendNotificationChangeEmail(email: string) {
    return this.mailer.sendNotificationChangeEmail(email);
  }

  async sendSignInEmail(email: string, link: string, signUp: boolean) {
    return signUp
      ? await this.mailer.sendSignUpMail(link.toString(), {
          to: email,
        })
      : await this.mailer.sendSignInMail(link.toString(), {
          to: email,
        });
  }
}
