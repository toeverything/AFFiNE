import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { compare, hash } from 'bcrypt';
import jwt from 'jsonwebtoken';

import { Config } from '../../config';
import { PrismaService } from '../../prisma';

type UserClaim = Pick<User, 'id' | 'name' | 'email'>;

@Injectable()
export class AuthService {
  constructor(private config: Config, private prisma: PrismaService) {}

  sign(user: UserClaim) {
    return jwt.sign(user, this.config.auth.privateKey, {
      algorithm: 'ES256',
      subject: user.id,
      issuer: this.config.serverId,
      expiresIn: this.config.auth.accessTokenExpiresIn,
    });
  }

  refresh(user: UserClaim) {
    return jwt.sign(user, this.config.auth.privateKey, {
      algorithm: 'ES256',
      subject: user.id,
      issuer: this.config.serverId,
      expiresIn: this.config.auth.refreshTokenExpiresIn,
    });
  }

  verify(token: string) {
    try {
      return jwt.verify(token, this.config.auth.publicKey, {
        algorithms: ['ES256'],
      }) as UserClaim;
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

    const equal = await compare(password, user.password);

    if (!equal) {
      throw new UnauthorizedException('Invalid password');
    }

    return user;
  }

  async register(name: string, email: string, password: string): Promise<User> {
    const hashedPassword = await hash(password, this.config.auth.salt);

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
        name,
        email,
        password: hashedPassword,
      },
    });
  }
}
