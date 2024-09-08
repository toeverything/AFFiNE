import { PrismaClient } from '@prisma/client';
import { applyUpdate, Doc, encodeStateAsUpdate } from 'yjs';

import { DocID } from '../../core/utils/doc';

export class Guid1698398506533 {
  // do the migration
  static async up(db: PrismaClient) {
    let turn = 0;
    let lastTurnCount = 100;
    while (lastTurnCount === 100) {
      const docs = await db.snapshot.findMany({
        select: {
          workspaceId: true,
          id: true,
        },
        skip: turn * 100,
        take: 100,
        orderBy: {
          createdAt: 'asc',
        },
      });

      lastTurnCount = docs.length;
      for (const doc of docs) {
        const docId = new DocID(doc.id, doc.workspaceId);

        // NOTE:
        // `doc.id` could be 'space:xxx' or 'xxx'
        // `docId.guid` is always 'xxx'
        // what we want achieve is:
        //   if both 'space:xxx' and 'xxx' exist, merge 'space:xxx' to 'xxx' and delete it
        //   else just modify 'space:xxx' to 'xxx'

        if (docId && !docId.isWorkspace && docId.guid !== doc.id) {
          const existingUpdate = await db.snapshot.findFirst({
            where: {
              id: docId.guid,
              workspaceId: doc.workspaceId,
            },
            select: {
              blob: true,
            },
          });

          // we have missing update with wrong id used before and need to be recovered
          if (existingUpdate) {
            const toBeMergeUpdate = await db.snapshot.findFirst({
              // id 'space:xxx'
              where: {
                id: doc.id,
                workspaceId: doc.workspaceId,
              },
              select: {
                blob: true,
              },
            });

            // no conflict
            // actually unreachable path
            if (!toBeMergeUpdate) {
              continue;
            }

            // recover
            const yDoc = new Doc();
            applyUpdate(yDoc, toBeMergeUpdate.blob);
            applyUpdate(yDoc, existingUpdate.blob);
            const update = encodeStateAsUpdate(yDoc);

            await db.$transaction([
              // we already have 'xxx', delete 'space:xxx'
              db.snapshot.deleteMany({
                where: {
                  id: doc.id,
                  workspaceId: doc.workspaceId,
                },
              }),
              db.snapshot.update({
                where: {
                  workspaceId_id: {
                    id: docId.guid,
                    workspaceId: doc.workspaceId,
                  },
                },
                data: {
                  blob: Buffer.from(update),
                },
              }),
            ]);
          } else {
            // there is no updates need to be merged
            // just modify the id the required one
            await db.snapshot.update({
              where: {
                workspaceId_id: {
                  id: doc.id,
                  workspaceId: doc.workspaceId,
                },
              },
              data: {
                id: docId.guid,
              },
            });
          }
        }
      }

      turn++;
    }
  }

  // revert the migration
  static async down() {
    //
  }
}
