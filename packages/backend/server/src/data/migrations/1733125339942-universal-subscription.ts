import { PrismaClient } from '@prisma/client';

import { loop } from './utils/loop';

export class UniversalSubscription1733125339942 {
  // do the migration
  static async up(db: PrismaClient) {
    await loop(async (offset, take) => {
      const oldSubscriptions = await db.deprecatedUserSubscription.findMany({
        skip: offset,
        take,
      });

      await db.subscription.createMany({
        data: oldSubscriptions.map(({ userId, ...subscription }) => ({
          targetId: userId,
          ...subscription,
        })),
      });

      return oldSubscriptions.length;
    }, 50);
  }

  // revert the migration
  static async down(_db: PrismaClient) {
    // noop
  }
}
