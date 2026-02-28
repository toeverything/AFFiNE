import { PrismaClient, WorkspaceMemberStatus } from '@prisma/client';

export class MigrateInviteStatus1732861452428 {
  // do the migration
  static async up(db: PrismaClient) {
    await db.workspaceUserRole.updateMany({
      where: {
        accepted: true,
      },
      data: {
        status: WorkspaceMemberStatus.Accepted,
      },
    });
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
