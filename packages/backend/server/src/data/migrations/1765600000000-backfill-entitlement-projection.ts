import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { LegacyEntitlementProjectionService } from '../../core/entitlement';

export class BackfillEntitlementProjection1765600000000 {
  static async up(_db: PrismaClient, ref: ModuleRef) {
    const projection = ref.get(LegacyEntitlementProjectionService, {
      strict: false,
    });
    await projection.shadowBackfillEntitlementsAndQuotaStates();
  }

  static async down(_db: PrismaClient) {}
}
