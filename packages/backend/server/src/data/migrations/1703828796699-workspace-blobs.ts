import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { WorkspaceBlobStorage } from '../../core/storage';

export class WorkspaceBlobs1703828796699 {
  // do the migration
  static async up(db: PrismaClient, injector: ModuleRef) {
    const blobStorage = injector.get(WorkspaceBlobStorage, { strict: false });
    let hasMore = true;
    let turn = 0;
    const eachTurnCount = 50;

    while (hasMore) {
      const blobs = await db.blob.findMany({
        skip: turn * eachTurnCount,
        take: eachTurnCount,
        orderBy: {
          createdAt: 'asc',
        },
      });

      hasMore = blobs.length === eachTurnCount;
      turn += 1;

      await Promise.all(
        blobs.map(async ({ workspaceId, hash, blob }) =>
          blobStorage.put(workspaceId, hash, blob)
        )
      );
    }
  }

  // revert the migration
  static async down(_db: PrismaClient) {
    // old data kept, no need to downgrade the migration
  }
}
