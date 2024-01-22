import { ModuleRef } from '@nestjs/core';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

import { Config } from '../../fundamentals';

export class SelfHostAdmin1605053000403 {
  // do the migration
  static async up(db: PrismaClient, ref: ModuleRef) {
    const config = ref.get(Config, { strict: false });
    if (config.flavor.selfhosted) {
      if (
        !process.env.AFFINE_ADMIN_EMAIL ||
        !process.env.AFFINE_ADMIN_PASSWORD
      ) {
        throw new Error(
          'You have to set AFFINE_ADMIN_EMAIL and AFFINE_ADMIN_PASSWORD environment variables to generate the initial user for self-hosted AFFiNE Server.'
        );
      }
      await db.user.create({
        data: {
          name: 'AFFINE First User',
          email: process.env.AFFINE_ADMIN_EMAIL,
          emailVerified: new Date(),
          password: await hash(process.env.AFFINE_ADMIN_PASSWORD),
        },
      });
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
