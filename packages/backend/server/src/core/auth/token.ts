import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';

import { CryptoHelper } from '../../fundamentals/helpers';

export enum TokenType {
  SignIn,
  VerifyEmail,
  ChangeEmail,
  ChangePassword,
  Challenge,
}

@Injectable()
export class TokenService {
  constructor(
    private readonly db: PrismaClient,
    private readonly crypto: CryptoHelper
  ) {}

  async createToken(
    type: TokenType,
    credential?: string,
    ttlInSec: number = 30 * 60
  ) {
    const plaintextToken = randomUUID();

    const { token } = await this.db.verificationToken.create({
      data: {
        type,
        token: plaintextToken,
        credential,
        expiresAt: new Date(Date.now() + ttlInSec * 1000),
      },
    });

    return this.crypto.encrypt(token);
  }

  /**
   * get token by type
   *
   * token will be revoked if expired or keep is not set
   */
  async getToken(type: TokenType, token: string, keep?: boolean) {
    token = this.crypto.decrypt(token);
    const record = await this.db.verificationToken.findUnique({
      where: {
        type_token: {
          token,
          type,
        },
      },
    });

    if (!record) {
      return null;
    }

    const expired = record.expiresAt <= new Date();

    // always revoke expired token
    if (expired || !keep) {
      const deleted = await this.revokeToken(type, token);

      // already deleted, means token has been used
      if (!deleted.count) {
        return null;
      }
    }

    return !expired ? record : null;
  }

  /**
   * get token and verify credential
   *
   * if credential is not provided, it will be failed
   *
   * token will be revoked if expired or keep is not set
   */
  async verifyToken(
    type: TokenType,
    token: string,
    {
      credential,
      keep,
    }: {
      credential?: string;
      keep?: boolean;
    } = {}
  ) {
    token = this.crypto.decrypt(token);
    const record = await this.db.verificationToken.findUnique({
      where: {
        type_token: {
          token,
          type,
        },
      },
    });

    if (!record) {
      return null;
    }

    const expired = record.expiresAt <= new Date();
    const valid =
      !expired && (!record.credential || record.credential === credential);

    // always revoke expired token
    if (expired || (valid && !keep)) {
      const deleted = await this.revokeToken(type, token);

      // already deleted, means token has been used
      if (!deleted.count) {
        return null;
      }
    }

    return valid ? record : null;
  }

  async revokeToken(type: TokenType, token: string) {
    return await this.db.verificationToken.deleteMany({
      where: {
        token,
        type,
      },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanExpiredTokens() {
    await this.db.verificationToken.deleteMany({
      where: {
        expiresAt: {
          lte: new Date(),
        },
      },
    });
  }
}
