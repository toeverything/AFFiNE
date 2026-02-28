import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { FeatureModel } from '../../models';

export class RefreshFeatures0001 {
  static always = true;

  // do the migration
  static async up(_db: PrismaClient, ref: ModuleRef) {
    await ref.get(FeatureModel, { strict: false }).refreshFeatures();
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
