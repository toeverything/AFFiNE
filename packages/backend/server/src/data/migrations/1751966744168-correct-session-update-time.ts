import { PrismaClient } from '@prisma/client';

type SessionTime = {
  sessionId: string;
  _max: {
    createdAt: Date;
  };
};

export class CorrectSessionUpdateTime1751966744168 {
  // do the migration
  static async up(db: PrismaClient) {
    const sessionTime = await db.aiSessionMessage.groupBy({
      by: ['sessionId'],
      _max: {
        createdAt: true,
      },
    });

    await Promise.all(
      sessionTime
        .filter((s): s is SessionTime => !!s._max.createdAt)
        .map(s =>
          db.aiSession.update({
            where: { id: s.sessionId },
            data: { updatedAt: s._max.createdAt },
          })
        )
    );
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
