import type { User } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

export class UnamedAccount1703756315970 {
  // do the migration
  static async up(db: PrismaClient) {
    await db.$transaction(async tx => {
      // only find users with empty names
      const users = await db.$queryRaw<
        User[]
      >`SELECT * FROM users WHERE name ~ E'^[\\s\\u2000-\\u200F]*$';`;

      await Promise.all(
        users.map(({ id, email }) =>
          tx.user.update({
            where: { id },
            data: {
              name: email.split('@')[0],
            },
          })
        )
      );
    });
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
