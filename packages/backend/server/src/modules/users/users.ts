import { Injectable } from '@nestjs/common';

import { Config } from '../../config';
import { PrismaService } from '../../prisma';
import { StorageQuotaService } from '../quota';
import { NewFeaturesKind } from './types';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageQuota: StorageQuotaService,
    private readonly config: Config
  ) {}

  async canEarlyAccess(email: string) {
    // TODO: Outdated, switch to feature gates
    if (
      this.config.featureFlags.earlyAccessPreview &&
      !email.endsWith('@toeverything.info')
    ) {
      return this.prisma.newFeaturesWaitingList
        .findUnique({
          where: { email, type: NewFeaturesKind.EarlyAccess },
        })
        .catch(() => false);
    } else {
      return true;
    }
  }

  async getStorageQuotaById(userId: string) {
    const quota = await this.storageQuota.getStorageQuotaByUser(userId);
    return quota?.storageQuota;
  }

  async findUserByEmail(email: string) {
    return this.prisma.user
      .findUnique({
        where: { email },
      })
      .catch(() => {
        return null;
      });
  }

  async findUserById(id: string) {
    return this.prisma.user
      .findUnique({
        where: { id },
      })
      .catch(() => {
        return null;
      });
  }

  async deleteUser(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }
}
