import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { IndexerService } from '../../plugins/indexer';

export class CreateIndexerTables1745211351719 {
  static always = true;

  // do the migration
  static async up(_db: PrismaClient, ref: ModuleRef) {
    await ref.get(IndexerService, { strict: false }).createTables();
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
