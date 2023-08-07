import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { Algorithm, sign, verify as jwtVerify } from '@node-rs/jsonwebtoken';
import type { User } from '@prisma/client';

import { Config } from '../../config';
import { PrismaService } from '../../prisma';
import { MailService } from './mailer';

export type UserClaim = Pick<
  User,
  'id' | 'name' | 'email' | 'emailVerified' | 'createdAt' | 'avatarUrl'
> & {
  hasPassword?: boolean;
};

export const getUtcTimestamp = () => Math.floor(new Date().getTime() / 1000);

@Injectable()
export class AuthService {
  constructor(
    private config: Config,
    private prisma: PrismaService,
    private mailer: MailService
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
        aud: user.name,
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
        aud: user.name,
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

  async signIn(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
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
        email,
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
      },
    });
  }

  async createAnonymousUser(email: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
      },
    });

    if (user) {
      throw new BadRequestException('Email already exists');
    }

    return this.prisma.user.create({
      data: {
        name: 'Unnamed',
        email,
      },
    });
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: {
        email,
      },
    });
  }

  async isUserHasPassword(email: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
      },
    });
    if (!user) {
      throw new BadRequestException('Invalid email');
    }
    return Boolean(user.password);
  }

  async changePassword(id: string, newPassword: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid email');
    }

    const hashedPassword = await hash(newPassword);

    return this.prisma.user.update({
      where: {
        id,
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
}
