import { Injectable } from '@nestjs/common';

import { Config } from '../../config';
import { PrismaService } from '../../prisma';
import { getStorageQuota } from './gates';
import { NewFeaturesKind } from './types';
import { isStaff } from './utils';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: Config
  ) {}

  async canEarlyAccess(email: string) {
    if (this.config.featureFlags.earlyAccessPreview && !isStaff(email)) {
      return this.isEarlyAccessUser(email);
    } else {
      return true;
    }
  }

  async isEarlyAccessUser(email: string) {
    return this.prisma.newFeaturesWaitingList
      .count({
        where: { email, type: NewFeaturesKind.EarlyAccess },
      })
      .then(count => count > 0)
      .catch(() => false);
  }

  async getStorageQuotaById(id: string) {
    const features = await this.prisma.user
      .findUnique({
        where: { id },
        select: {
          features: {
            select: {
              feature: true,
            },
          },
        },
      })
      .then(user => user?.features.map(f => f.feature) ?? []);

    return getStorageQuota(features) || this.config.objectStorage.quota;
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
