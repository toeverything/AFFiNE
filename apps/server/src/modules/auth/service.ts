import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { User } from '@prisma/client';
import jwt from 'jsonwebtoken';

import { Config } from '../../config';
import { PrismaService } from '../../prisma';

type UserClaim = Pick<User, 'id' | 'name' | 'email'>;

@Injectable()
export class AuthService {
  constructor(private config: Config, private prisma: PrismaService) {}

  sign(user: UserClaim) {
    return jwt.sign(user, this.config.secret);
  }

  verify(token: string) {
    try {
      const claims = jwt.verify(token, this.config.secret) as UserClaim;
      return claims;
    } catch (e) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async signIn(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        password,
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid email or password');
    }

    return user;
  }
}
