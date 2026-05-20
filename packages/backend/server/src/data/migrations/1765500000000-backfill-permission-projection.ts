import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { WorkspacePolicyService } from '../../core/permission/policy';
import { Models } from '../../models';

export class BackfillPermissionProjection1765500000000 {
  static async up(_db: PrismaClient, ref: ModuleRef) {
    const models = ref.get(Models, { strict: false });
    await models.permissionProjection.backfillLegacyProjection();

    const policy = ref.get(WorkspacePolicyService, { strict: false });
    const workspaces = await _db.workspace.findMany({
      select: { id: true },
    });
    for (const workspace of workspaces) {
      const state = await policy.getWorkspaceState(workspace.id);
      await models.workspaceRuntimeState.upsert(workspace.id, {
        readonly: state.isReadonly,
        readonlyReasons: state.readonlyReasons,
        known: true,
        staleAfter: null,
      });
    }
  }

  static async down(_db: PrismaClient) {}
}
