import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

export class BackfillPermissionProjection1765500000000 {
  static async up(db: PrismaClient, _ref: ModuleRef) {
    await ensureWorkspaceAdminStatsDirtyTriggerGuard(db);
    await repairOwnerlessWorkspaces(db);
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
