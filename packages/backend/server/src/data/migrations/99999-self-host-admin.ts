import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { FeatureManagementService } from '../../core/features';
import { Config } from '../../fundamentals';

export class SelfHostAdmin1 {
  // do the migration
  static async up(db: PrismaClient, ref: ModuleRef) {
    const config = ref.get(Config, { strict: false });
    if (config.isSelfhosted) {
      const feature = ref.get(FeatureManagementService, { strict: false });

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
  static async down() {
    //
  }
}
