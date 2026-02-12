import { Injectable } from '@nestjs/common';

import { CryptoHelper } from '../base';
import { BaseModel } from './base';

const REDACTED_TOKEN = '[REDACTED]';

export interface CreateAccessTokenInput {
  userId: string;
  name: string;
  expiresAt?: Date | null;
}

type UserAccessToken = {
  id: string;
  name: string;
  createdAt: Date;
  expiresAt: Date | null;
};

@Injectable()
export class AccessTokenModel extends BaseModel {
  constructor(private readonly crypto: CryptoHelper) {
    super();
  }

  async list(userId: string, revealed?: false): Promise<UserAccessToken[]>;
  async list(
    userId: string,
    revealed: true
  ): Promise<(UserAccessToken & { token: string })[]>;
  async list(userId: string, revealed: boolean = false) {
    const tokens = await this.db.accessToken.findMany({
      select: { id: true, name: true, createdAt: true, expiresAt: true },
      where: { userId },
    });

    if (!revealed) return tokens;

    return tokens.map(row => ({ ...row, token: REDACTED_TOKEN }));
  }

  async create(input: CreateAccessTokenInput) {
    const token = `ut_${this.crypto.randomBytes(32).toString('base64url')}`;
    const tokenHash = this.crypto.sha256(token).toString('hex');

    const created = await this.db.accessToken.create({
      data: { token: tokenHash, ...input },
    });

    // NOTE: we only return the plaintext token once, at creation time.
    return { ...created, token };
  }

  async revoke(id: string, userId: string) {
    await this.db.accessToken.deleteMany({
      where: {
        id,
        userId,
      },
    });
  }

  async getByToken(token: string) {
    const tokenHash = this.crypto.sha256(token).toString('hex');

    const condition = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];
    const found = await this.db.accessToken.findUnique({
      where: { token: tokenHash, OR: condition },
    });

    if (found) return found;

    // Compatibility: lazy-migrate old plaintext tokens in DB.
    const legacy = await this.db.accessToken.findUnique({
      where: { token, OR: condition },
    });

    if (!legacy) return null;

    await this.db.accessToken.update({
      where: { id: legacy.id },
      data: { token: tokenHash },
    });

    return { ...legacy, token: tokenHash };
  }
}
