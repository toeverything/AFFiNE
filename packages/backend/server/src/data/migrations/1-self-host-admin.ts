import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { FeatureManagementService } from '../../core/features';
import { UserService } from '../../core/user';
import { Config, CryptoHelper } from '../../fundamentals';

export class SelfHostAdmin1 {
  // do the migration
  static async up(db: PrismaClient, ref: ModuleRef) {
    const config = ref.get(Config, { strict: false });
    if (config.isSelfhosted) {
      const crypto = ref.get(CryptoHelper, { strict: false });
      const user = ref.get(UserService, { strict: false });
      const feature = ref.get(FeatureManagementService, { strict: false });
      if (
        !process.env.AFFINE_ADMIN_EMAIL ||
        !process.env.AFFINE_ADMIN_PASSWORD
      ) {
        throw new Error(
          'You have to set AFFINE_ADMIN_EMAIL and AFFINE_ADMIN_PASSWORD environment variables to generate the initial user for self-hosted AFFiNE Server.'
        );
      }

      await user.findOrCreateUser(process.env.AFFINE_ADMIN_EMAIL, {
        name: 'AFFINE First User',
        emailVerifiedAt: new Date(),
        password: await crypto.encryptPassword(
          process.env.AFFINE_ADMIN_PASSWORD
        ),
      });

      const firstUser = await db.user.findFirst({
        orderBy: {
          createdAt: 'asc',
        },
      });
      if (firstUser) {
        await feature.addAdmin(firstUser.id);
      }
    }
  }

  // revert the migration
  static async down(db: PrismaClient) {
    await db.user.deleteMany({
      where: {
        email: process.env.AFFINE_ADMIN_EMAIL ?? 'admin@example.com',
      },
    });
  }
}
