import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { Models } from '../../models';

export class BackfillPermissionProjection1765500000000 {
  static async up(db: PrismaClient, ref: ModuleRef) {
    const models = ref.get(Models, { strict: false });
    await models.permissionProjection.backfillLegacyProjection();
    await ensureWorkspaceAdminStatsDirtyTriggerGuard(db);
    await repairOwnerlessWorkspaces(db);
    await backfillUnknownQuotaRuntimeStates(db);
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

async function backfillUnknownQuotaRuntimeStates(db: PrismaClient) {
  await db.$executeRaw`
    INSERT INTO effective_user_quota_states (
      user_id,
      plan,
      source_entitlement_id,
      blob_limit,
      storage_quota,
      used_storage_quota,
      history_period_seconds,
      copilot_action_limit,
      flags,
      known,
      stale,
      last_reconciled_at,
      stale_after
    )
    SELECT
      users.id,
      'free',
      NULL,
      0,
      0,
      0,
      0,
      NULL,
      '{}'::jsonb,
      false,
      true,
      NULL,
      NULL
    FROM users
    ON CONFLICT (user_id)
    DO UPDATE SET
      stale = true,
      updated_at = now()
  `;

  await db.$executeRaw`
    WITH owners AS (
      SELECT workspace_id, user_id
      FROM workspace_members
      WHERE role = 'owner'
        AND state = 'active'
    )
    INSERT INTO effective_workspace_quota_states (
      workspace_id,
      plan,
      source_entitlement_id,
      owner_user_id,
      uses_owner_quota,
      seat_limit,
      member_count,
      overcapacity_member_count,
      blob_limit,
      storage_quota,
      used_storage_quota,
      history_period_seconds,
      readonly,
      readonly_reasons,
      flags,
      known,
      stale,
      last_reconciled_at,
      stale_after
    )
    SELECT
      workspaces.id,
      'free',
      NULL,
      owners.user_id,
      true,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      false,
      ARRAY[]::text[],
      '{}'::jsonb,
      false,
      true,
      NULL,
      NULL
    FROM workspaces
    JOIN owners ON owners.workspace_id = workspaces.id
    ON CONFLICT (workspace_id)
    DO UPDATE SET
      stale = true,
      updated_at = now()
  `;

  await db.$executeRaw`
    INSERT INTO workspace_runtime_states (
      workspace_id,
      known,
      readonly,
      readonly_reasons,
      last_reconciled_at,
      stale_after,
      updated_at
    )
    SELECT
      workspace_id,
      false,
      false,
      ARRAY[]::text[],
      NULL,
      NULL,
      now()
    FROM effective_workspace_quota_states
    ON CONFLICT (workspace_id)
    DO NOTHING
  `;
}

async function repairOwnerlessWorkspaces(db: PrismaClient) {
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

  await db.$executeRaw`
      WITH accepted_members AS (
        SELECT DISTINCT ON (wm.workspace_id) wm.id
        FROM workspace_members wm
        WHERE wm.state = 'active'
          AND NOT EXISTS (
            SELECT 1
            FROM workspace_members owner
            WHERE owner.workspace_id = wm.workspace_id
              AND owner.role = 'owner'
              AND owner.state = 'active'
          )
        ORDER BY wm.workspace_id, wm.created_at ASC, wm.id ASC
      )
      UPDATE workspace_members wm
      SET role = 'owner', updated_at = now()
      FROM accepted_members am
      WHERE wm.id = am.id
    `;
}
