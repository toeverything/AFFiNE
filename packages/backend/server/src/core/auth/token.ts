import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { CryptoHelper } from '../../fundamentals/helpers';

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

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
      await this.revokeToken(type, token, this.db);
    }

    return valid ? record : null;
  }

  async revokeToken(type: TokenType, token: string, tx?: Transaction) {
    const client = tx || this.db;
    await client.verificationToken.delete({
      where: {
        type_token: {
          token,
          type,
        },
      },
    });
  }
}
