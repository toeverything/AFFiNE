import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { LegacyEntitlementProjectionService } from '../../core/entitlement';
import { QuotaStateService } from '../../core/quota/state';

export class BackfillEntitlementProjection1765600000000 {
  static async up(db: PrismaClient, ref: ModuleRef) {
    const projection = ref.get(LegacyEntitlementProjectionService, {
      strict: false,
    });
    await projection.backfillEntitlementsAndQuotaStates();

    const quota = ref.get(QuotaStateService, { strict: false });
    const [users, workspaces] = await Promise.all([
      db.user.findMany({ select: { id: true } }),
      db.workspace.findMany({ select: { id: true } }),
    ]);

    const tasks = [
      ...users.map(user => () => quota.reconcileUserQuotaState(user.id)),
      ...workspaces.map(
        workspace => () => quota.reconcileWorkspaceQuotaState(workspace.id)
      ),
    ];
    const batchSize = 16;
    for (let index = 0; index < tasks.length; index += batchSize) {
      await Promise.all(
        tasks.slice(index, index + batchSize).map(task => task())
      );
    }
  }

  static async down(_db: PrismaClient) {}
}
