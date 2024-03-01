import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { Algorithm, sign, verify as jwtVerify } from '@node-rs/jsonwebtoken';
import { PrismaClient, type User } from '@prisma/client';
import { nanoid } from 'nanoid';

import {
  Config,
  MailService,
  verifyChallengeResponse,
} from '../../fundamentals';
import { Quota_FreePlanV1_1 } from '../quota';

export type UserClaim = Pick<
  User,
  'id' | 'name' | 'email' | 'emailVerified' | 'createdAt' | 'avatarUrl'
> & {
  hasPassword?: boolean;
};

export const getUtcTimestamp = () => Math.floor(Date.now() / 1000);

@Injectable()
export class AuthService {
  constructor(
    private readonly config: Config,
    private readonly prisma: PrismaClient,
    private readonly mailer: MailService
  ) {}

  sign(user: UserClaim) {
    const now = getUtcTimestamp();
    return sign(
      {
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified?.toISOString(),
          image: user.avatarUrl,
          hasPassword: Boolean(user.hasPassword),
          createdAt: user.createdAt.toISOString(),
        },
        iat: now,
        exp: now + this.config.auth.accessTokenExpiresIn,
        iss: this.config.serverId,
        sub: user.id,
        aud: 'https://affine.pro',
        jti: randomUUID({
          disableEntropyCache: true,
        }),
      },
      this.config.auth.privateKey,
      {
        algorithm: Algorithm.ES256,
      }
    );
  }

  refresh(user: UserClaim) {
    const now = getUtcTimestamp();
    return sign(
      {
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified?.toISOString(),
          image: user.avatarUrl,
          hasPassword: Boolean(user.hasPassword),
          createdAt: user.createdAt.toISOString(),
        },
        exp: now + this.config.auth.refreshTokenExpiresIn,
        iat: now,
        iss: this.config.serverId,
        sub: user.id,
        aud: 'https://affine.pro',
        jti: randomUUID({
          disableEntropyCache: true,
        }),
      },
      this.config.auth.privateKey,
      {
        algorithm: Algorithm.ES256,
      }
    );
  }

  async verify(token: string) {
    try {
      const data = (
        await jwtVerify(token, this.config.auth.publicKey, {
          algorithms: [Algorithm.ES256],
          iss: [this.config.serverId],
          leeway: this.config.auth.leeway,
          requiredSpecClaims: ['exp', 'iat', 'iss', 'sub'],
          aud: ['https://affine.pro'],
        })
      ).data as UserClaim;

      return {
        ...data,
        emailVerified: data.emailVerified ? new Date(data.emailVerified) : null,
        createdAt: new Date(data.createdAt),
      };
    } catch (e) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async verifyCaptchaToken(token: any, ip: string) {
    if (typeof token !== 'string' || !token) return false;

    const formData = new FormData();
    formData.append('secret', this.config.auth.captcha.turnstile.secret);
    formData.append('response', token);
    formData.append('remoteip', ip);
    // prevent replay attack
    formData.append('idempotency_key', nanoid());

    const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    const result = await fetch(url, {
      body: formData,
      method: 'POST',
    });
    const outcome = await result.json();

    return (
      !!outcome.success &&
      // skip hostname check in dev mode
      (this.config.node.dev || outcome.hostname === this.config.host)
    );
  }

  async verifyChallengeResponse(response: any, resource: string) {
    return verifyChallengeResponse(
      response,
      this.config.auth.captcha.challenge.bits,
      resource
    );
  }

  async signIn(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid email');
    }

    if (!user.password) {
      throw new BadRequestException('User has no password');
    }
    let equal = false;
    try {
      equal = await verify(user.password, password);
    } catch (e) {
      console.error(e);
      throw new InternalServerErrorException(e, 'Verify password failed');
    }
    if (!equal) {
      throw new UnauthorizedException('Invalid password');
    }

    return user;
  }

  async signUp(name: string, email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
    });

    if (user) {
      throw new BadRequestException('Email already exists');
    }

    const hashedPassword = await hash(password);

    return this.prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        // TODO(@forehalo): handle in event system
        features: {
          create: {
            reason: 'created by api sign up',
            activated: true,
            feature: {
              connect: {
                feature_version: Quota_FreePlanV1_1,
              },
            },
          },
        },
      },
    });
  }

  async createAnonymousUser(email: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
    });

    if (user) {
      throw new BadRequestException('Email already exists');
    }

    return this.prisma.user.create({
      data: {
        name: email.split('@')[0],
        email,
        features: {
          create: {
            reason: 'created by invite sign up',
            activated: true,
            feature: {
              connect: {
                feature_version: Quota_FreePlanV1_1,
              },
            },
          },
        },
      },
    });
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
    });
  }

  async isUserHasPassword(email: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
    });
    if (!user) {
      throw new BadRequestException('Invalid email');
    }
    return Boolean(user.password);
  }

  async changePassword(email: string, newPassword: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
        emailVerified: {
          not: null,
        },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid email');
    }

    const hashedPassword = await hash(newPassword);

    return this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        password: hashedPassword,
      },
    });
  }

  async changeEmail(id: string, newEmail: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid email');
    }

    return this.prisma.user.update({
      where: {
        id,
      },
      data: {
        email: newEmail,
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
  async sendNotificationChangeEmail(email: string) {
    return this.mailer.sendNotificationChangeEmail(email);
  }
}
