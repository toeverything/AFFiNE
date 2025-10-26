import { PrismaClient } from '@prisma/client';
import { chunk } from 'lodash-es';

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

    for (const s of chunk(sessionTime, 100)) {
      const sessions = s.filter((s): s is SessionTime => !!s._max.createdAt);
      await db.$transaction(async tx => {
        await Promise.all(
          sessions.map(s =>
            tx.aiSession.update({
              where: { id: s.sessionId },
              data: { updatedAt: s._max.createdAt },
            })
          )
        );
      });
    }
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
