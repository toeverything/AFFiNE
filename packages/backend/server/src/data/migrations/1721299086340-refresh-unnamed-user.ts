import { PrismaClient, User } from '@prisma/client';

export class RefreshUnnamedUser1721299086340 {
  // do the migration
  static async up(db: PrismaClient) {
    await db.$transaction(async tx => {
      // only find users with unnamed names
      const users = await db.$queryRaw<
        User[]
      >`SELECT * FROM users WHERE name = 'Unnamed';`;

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
