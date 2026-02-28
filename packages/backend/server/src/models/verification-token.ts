import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { type VerificationToken } from '@prisma/client';

import { CryptoHelper } from '../base/helpers';
import { BaseModel } from './base';

export type { VerificationToken };

export enum TokenType {
  SignIn,
  VerifyEmail,
  ChangeEmail,
  ChangePassword,
  Challenge,
}

@Injectable()
export class VerificationTokenModel extends BaseModel {
  constructor(private readonly crypto: CryptoHelper) {
    super();
  }

  /**
   * create token by type and credential (optional) with ttl in seconds (default 30 minutes)
   */
  async create(
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
   * token will be deleted if expired or keep is not set
   */
  async get(type: TokenType, token: string, keep?: boolean) {
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

    const isExpired = record.expiresAt <= new Date();

    // always delete expired token
    // or if keep is not set for one time token
    if (isExpired || !keep) {
      const count = await this.delete(type, token);

      // already deleted, means token has been used
      if (!count) {
        return null;
      }
    }

    return !isExpired ? record : null;
  }

  /**
   * get token and verify credential
   *
   * if credential is not provided, it will be failed
   *
   * token will be deleted if expired or keep is not set
   */
  async verify(
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
    const record = await this.get(type, token, true);
    if (!record) {
      return null;
    }

    const valid = !record.credential || record.credential === credential;
    // keep is not set for one time valid token
    if (valid && !keep) {
      const count = await this.delete(type, record.token);

      // already deleted, means token has been used
      if (!count) {
        return null;
      }
    }

    return valid ? record : null;
  }

  async delete(type: TokenType, token: string) {
    const { count } = await this.db.verificationToken.deleteMany({
      where: {
        token,
        type,
      },
    });
    if (count > 0) {
      this.logger.log(
        `Deleted token success by type ${type} and token ${token}`
      );
    }
    return count;
  }

  /**
   * clean expired tokens
   */
  async cleanExpired() {
    const { count } = await this.db.verificationToken.deleteMany({
      where: {
        expiresAt: {
          lte: new Date(),
        },
      },
    });
    if (count > 0) {
      this.logger.log(`Cleaned ${count} expired tokens`);
    }
    return count;
  }
}
