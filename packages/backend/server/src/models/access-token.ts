import { Injectable } from '@nestjs/common';

import { CryptoHelper } from '../base';
import { BaseModel } from './base';

export interface CreateAccessTokenInput {
  userId: string;
  name: string;
  expiresAt?: Date | null;
}

@Injectable()
export class AccessTokenModel extends BaseModel {
  constructor(private readonly crypto: CryptoHelper) {
    super();
  }

  async list(userId: string, revealed: boolean = false) {
    return await this.db.accessToken.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
        expiresAt: true,
        token: revealed,
      },
      where: {
        userId,
      },
    });
  }

  async create(input: CreateAccessTokenInput) {
    let token = 'ut_' + this.crypto.randomBytes(40).toString('hex');
    token = token.substring(0, 40);

    return await this.db.accessToken.create({
      data: {
        token,
        ...input,
      },
    });
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
    return await this.db.accessToken.findUnique({
      where: {
        token,
        OR: [
          {
            expiresAt: null,
          },
          {
            expiresAt: {
              gt: new Date(),
            },
          },
        ],
      },
    });
  }
}
