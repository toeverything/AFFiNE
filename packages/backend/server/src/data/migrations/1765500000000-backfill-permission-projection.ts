import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { WorkspacePolicyService } from '../../core/permission/policy';
import { Models } from '../../models';

export class BackfillPermissionProjection1765500000000 {
  static async up(db: PrismaClient, ref: ModuleRef) {
    const models = ref.get(Models, { strict: false });
    await models.permissionProjection.backfillLegacyProjection();
    await ensureWorkspaceAdminStatsDirtyTriggerGuard(db);
    await repairOwnerlessWorkspaces(db);

    const policy = ref.get(WorkspacePolicyService, { strict: false });
    const workspaces = await db.workspace.findMany({
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

async function ensureWorkspaceAdminStatsDirtyTriggerGuard(db: PrismaClient) {
  await db.$executeRaw`
      CREATE OR REPLACE FUNCTION workspace_admin_stats_mark_dirty() RETURNS TRIGGER AS $$
      DECLARE
        wid VARCHAR;
      BEGIN
        wid := COALESCE(NEW."workspace_id", OLD."workspace_id");
        IF wid IS NULL THEN
          RETURN NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM "workspaces" WHERE "id" = wid) THEN
          RETURN NULL;
        END IF;

        INSERT INTO "workspace_admin_stats_dirty" ("workspace_id", "updated_at")
        VALUES (wid, NOW())
        ON CONFLICT ("workspace_id")
        DO UPDATE SET "updated_at" = EXCLUDED."updated_at";

        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `;
}

async function repairOwnerlessWorkspaces(db: PrismaClient) {
  await db.$executeRaw`
      WITH ownerless AS (
        SELECT w.id
        FROM workspaces w
        WHERE NOT EXISTS (
          SELECT 1
          FROM workspace_members owner
          WHERE owner.workspace_id = w.id
            AND owner.role = 'owner'
            AND owner.state = 'active'
        )
      ),
      accepted_members AS (
        SELECT id
        FROM (
          SELECT
            wm.id,
            row_number() OVER (
              PARTITION BY wm.workspace_id
              ORDER BY wm.created_at ASC, wm.id ASC
            ) AS rn
          FROM workspace_members wm
          JOIN ownerless o ON o.id = wm.workspace_id
          WHERE wm.state = 'active'
        ) ranked
        WHERE rn = 1
      )
      UPDATE workspace_members wm
      SET role = 'owner', updated_at = now()
      FROM accepted_members am
      WHERE wm.id = am.id
    `;

  await db.$executeRaw`
      DELETE FROM workspaces w
      WHERE NOT EXISTS (
          SELECT 1
          FROM workspace_members owner
          WHERE owner.workspace_id = w.id
            AND owner.role = 'owner'
            AND owner.state = 'active'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM workspace_members member
          WHERE member.workspace_id = w.id
            AND member.state = 'active'
        )
    `;
}
