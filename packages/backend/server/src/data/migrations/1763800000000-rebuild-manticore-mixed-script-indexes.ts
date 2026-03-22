import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { IndexerService } from '../../plugins/indexer';

export class RebuildManticoreMixedScriptIndexes1763800000000 {
  static async up(_db: PrismaClient, ref: ModuleRef) {
    await ref.get(IndexerService, { strict: false }).rebuildManticoreIndexes();
  }

  static async down(_db: PrismaClient) {}
}
