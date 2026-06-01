import { Injectable, Optional } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { metrics } from '../base';
import { BaseModel } from './base';

type CountRow = { count: bigint };

type ProjectionIssueRow = {
  category: string;
  count: bigint;
};

type ProjectionBackfillDb = {
  $transaction: (
    callback: (
      tx: Pick<Prisma.TransactionClient, '$executeRaw'>
    ) => Promise<void>,
    options?: { timeout?: number }
  ) => Promise<void>;
};

export type PermissionProjectionCheckReport = {
  oldWorkspacePolicyMismatch: number;
  oldAcceptedMemberMismatch: number;
  extraProjectedMember: number;
  oldInvitationMismatch: number;
  extraProjectedInvitation: number;
  oldDocGrantMismatch: number;
  extraProjectedDocGrant: number;
  oldDocPolicyMismatch: number;
  extraProjectedDocPolicy: number;
  runtimeStateMissing: number;
  runtimeStateMismatch: number;
  ownerConflict: number;
  oldNewDecisionMismatch: number;
  invalidLegacyRows: Record<string, number>;
};

export const PERMISSION_PROJECTION_TRIGGER_ERROR_CATEGORIES = [
  'owner_conflict',
  'invalid_legacy_role',
  'foreign_key_missing',
  'projection_recursion_guard_missing',
  'unknown',
] as const;

export function permissionProjectionTriggerErrorCategory(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error ?? 'unknown');

  const match = message.match(/permission_projection_error:([^:]+):/);
  const category = match?.[1];
  if (!category) {
    return null;
  }

  return PERMISSION_PROJECTION_TRIGGER_ERROR_CATEGORIES.includes(
    category as (typeof PERMISSION_PROJECTION_TRIGGER_ERROR_CATEGORIES)[number]
  )
    ? category
    : 'unknown';
}

async function count(first: Promise<CountRow[]>) {
  const rows = await first;
  return Number(rows[0]?.count ?? 0);
}

@Injectable()
export class PermissionProjectionModel extends BaseModel {
  constructor(@Optional() private readonly prisma?: PrismaClient) {
    super();
  }

  async backfillLegacyProjection() {
    const db = (this.prisma ?? this.db) as unknown as ProjectionBackfillDb;

    await db.$transaction(
      async tx => {
        await tx.$executeRaw`
        SELECT set_config('affine.permission_sync_origin', 'legacy', true)
      `;

        await tx.$executeRaw`
        DELETE FROM workspace_members projected
        WHERE projected.legacy_permission_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM workspace_user_permissions old
            WHERE old.id = projected.legacy_permission_id
              AND old.status = 'Accepted'::"WorkspaceMemberStatus"
              AND affine_permission_legacy_workspace_role(old.type) IS NOT NULL
          )
      `;

        await tx.$executeRaw`
        DELETE FROM workspace_invitations projected
        WHERE projected.legacy_permission_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM workspace_user_permissions old
            WHERE old.id = projected.legacy_permission_id
              AND old.status <> 'Accepted'::"WorkspaceMemberStatus"
              AND affine_permission_workspace_invitation_state(old.status) IS NOT NULL
              AND affine_permission_legacy_workspace_role(old.type) IS NOT NULL
          )
      `;

        await tx.$executeRaw`
        DELETE FROM doc_grants projected
        WHERE projected.principal_type = 'user'
          AND NOT EXISTS (
            SELECT 1
            FROM workspace_page_user_permissions old
            WHERE old.workspace_id = projected.workspace_id
              AND old.page_id = projected.doc_id
              AND old.user_id = projected.principal_id
              AND affine_permission_legacy_doc_role(old.type) IS NOT NULL
          )
      `;

        await tx.$executeRaw`
        DELETE FROM doc_access_policies projected
        WHERE NOT EXISTS (
          SELECT 1
          FROM workspace_pages old
          WHERE old.workspace_id = projected.workspace_id
            AND old.page_id = projected.doc_id
            AND affine_permission_legacy_default_doc_role(old."defaultRole") IS NOT NULL
        )
      `;

        await tx.$executeRaw`
        DELETE FROM workspace_access_policies projected
        WHERE NOT EXISTS (
          SELECT 1
          FROM workspaces old
          WHERE old.id = projected.workspace_id
        )
      `;

        await tx.$executeRaw`
        INSERT INTO workspace_access_policies (
          workspace_id,
          visibility,
          sharing_enabled,
          url_preview_enabled,
          updated_at
        )
        SELECT
          id,
          CASE WHEN public THEN 'public' ELSE 'private' END,
          enable_sharing,
          enable_url_preview,
          now()
        FROM workspaces
        ON CONFLICT (workspace_id)
        DO UPDATE SET
          visibility = EXCLUDED.visibility,
          sharing_enabled = EXCLUDED.sharing_enabled,
          url_preview_enabled = EXCLUDED.url_preview_enabled,
          updated_at = now()
      `;

        await tx.$executeRaw`
        INSERT INTO workspace_members (
          workspace_id,
          user_id,
          role,
          state,
          source,
          legacy_permission_id,
          created_at,
          updated_at
        )
        SELECT
          workspace_id,
          user_id,
          affine_permission_legacy_workspace_role(type),
          'active',
          CASE source
            WHEN 'Email'::"WorkspaceMemberSource" THEN 'email'
            WHEN 'Link'::"WorkspaceMemberSource" THEN 'link'
            ELSE 'legacy'
          END,
          id,
          created_at,
          updated_at
        FROM workspace_user_permissions
        WHERE status = 'Accepted'::"WorkspaceMemberStatus"
          AND affine_permission_legacy_workspace_role(type) IS NOT NULL
        ON CONFLICT ("legacy_permission_id") WHERE "legacy_permission_id" IS NOT NULL
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          role = EXCLUDED.role,
          state = EXCLUDED.state,
          source = EXCLUDED.source,
          updated_at = EXCLUDED.updated_at
      `;

        await tx.$executeRaw`
        INSERT INTO workspace_invitations (
          workspace_id,
          invitee_user_id,
          inviter_user_id,
          requested_role,
          status,
          kind,
          legacy_permission_id,
          created_at,
          updated_at
        )
        SELECT
          workspace_id,
          user_id,
          inviter_id,
          CASE WHEN affine_permission_legacy_workspace_role(type) = 'admin' THEN 'admin' ELSE 'member' END,
          affine_permission_workspace_invitation_state(status),
          CASE source
            WHEN 'Link'::"WorkspaceMemberSource" THEN 'link'
            ELSE 'email'
          END,
          id,
          created_at,
          updated_at
        FROM workspace_user_permissions
        WHERE status <> 'Accepted'::"WorkspaceMemberStatus"
          AND affine_permission_workspace_invitation_state(status) IS NOT NULL
          AND affine_permission_legacy_workspace_role(type) IS NOT NULL
        ON CONFLICT ("legacy_permission_id") WHERE "legacy_permission_id" IS NOT NULL
        DO UPDATE SET
          invitee_user_id = EXCLUDED.invitee_user_id,
          inviter_user_id = EXCLUDED.inviter_user_id,
          requested_role = EXCLUDED.requested_role,
          status = EXCLUDED.status,
          kind = EXCLUDED.kind,
          updated_at = EXCLUDED.updated_at
      `;

        await tx.$executeRaw`
        INSERT INTO doc_access_policies (
          workspace_id,
          doc_id,
          visibility,
          public_role,
          member_default_role,
          published_at,
          updated_at
        )
        SELECT
          workspace_id,
          page_id,
          CASE WHEN public THEN 'public' ELSE 'private' END,
          CASE WHEN public THEN 'external' ELSE NULL END,
          affine_permission_legacy_default_doc_role("defaultRole"),
          published_at,
          now()
        FROM workspace_pages
        WHERE affine_permission_legacy_default_doc_role("defaultRole") IS NOT NULL
        ON CONFLICT (workspace_id, doc_id)
        DO UPDATE SET
          visibility = EXCLUDED.visibility,
          public_role = EXCLUDED.public_role,
          member_default_role = EXCLUDED.member_default_role,
          published_at = EXCLUDED.published_at,
          updated_at = now()
      `;

        await tx.$executeRaw`
        INSERT INTO doc_grants (
          workspace_id,
          doc_id,
          principal_type,
          principal_id,
          role,
          legacy_workspace_id,
          legacy_doc_id,
          legacy_user_id,
          created_at,
          updated_at
        )
        SELECT
          workspace_id,
          page_id,
          'user',
          user_id,
          affine_permission_legacy_doc_role(type),
          workspace_id,
          page_id,
          user_id,
          created_at,
          now()
        FROM workspace_page_user_permissions
        WHERE affine_permission_legacy_doc_role(type) IS NOT NULL
        ON CONFLICT (workspace_id, doc_id, principal_type, principal_id)
        DO UPDATE SET
          role = EXCLUDED.role,
          updated_at = now()
      `;
      },
      { timeout: 10 * 60 * 1000 }
    );
  }

  recordTriggerErrorMetric(error: unknown) {
    const category = permissionProjectionTriggerErrorCategory(error);
    if (!category) {
      return null;
    }

    metrics.permission
      .counter('projection_trigger_errors', {
        description: 'Permission projection trigger error count',
      })
      .add(1, { category });
    return category;
  }

  async checkLegacyProjection(): Promise<PermissionProjectionCheckReport> {
    const [
      oldWorkspacePolicyMismatch,
      oldAcceptedMemberMismatch,
      extraProjectedMember,
      oldInvitationMismatch,
      extraProjectedInvitation,
      oldDocGrantMismatch,
      extraProjectedDocGrant,
      oldDocPolicyMismatch,
      extraProjectedDocPolicy,
      ownerConflict,
      invalidLegacyRows,
    ] = await Promise.all([
      count(this.db.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::bigint AS count
        FROM workspaces old
        LEFT JOIN workspace_access_policies projected
          ON projected.workspace_id = old.id
        WHERE projected.workspace_id IS NULL
          OR projected.visibility <> CASE WHEN old.public THEN 'public' ELSE 'private' END
          OR projected.sharing_enabled <> old.enable_sharing
          OR projected.url_preview_enabled <> old.enable_url_preview
      `),
      count(this.db.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::bigint AS count
        FROM workspace_user_permissions old
        LEFT JOIN workspace_members projected
          ON projected.legacy_permission_id = old.id
          OR (
            projected.legacy_permission_id IS NULL
            AND projected.workspace_id = old.workspace_id
            AND projected.user_id = old.user_id
            AND projected.state = 'active'
          )
        WHERE old.status = 'Accepted'::"WorkspaceMemberStatus"
          AND affine_permission_legacy_workspace_role(old.type) IS NOT NULL
          AND (
            projected.id IS NULL OR
            projected.workspace_id <> old.workspace_id OR
            projected.user_id <> old.user_id OR
            projected.role <> affine_permission_legacy_workspace_role(old.type) OR
            projected.state <> 'active'
          )
      `),
      count(this.db.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::bigint AS count
        FROM workspace_members projected
        LEFT JOIN workspace_user_permissions old
          ON old.id = projected.legacy_permission_id
          OR (
            projected.legacy_permission_id IS NULL
            AND old.workspace_id = projected.workspace_id
            AND old.user_id = projected.user_id
            AND old.status = 'Accepted'::"WorkspaceMemberStatus"
          )
        WHERE
          projected.state = 'active'
          AND (
            old.id IS NULL OR
            old.status <> 'Accepted'::"WorkspaceMemberStatus" OR
            affine_permission_legacy_workspace_role(old.type) IS NULL
          )
      `),
      count(this.db.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::bigint AS count
        FROM workspace_user_permissions old
        LEFT JOIN workspace_invitations projected
          ON projected.legacy_permission_id = old.id
          OR (
            projected.legacy_permission_id IS NULL
            AND projected.workspace_id = old.workspace_id
            AND projected.invitee_user_id = old.user_id
          )
        WHERE old.status <> 'Accepted'::"WorkspaceMemberStatus"
          AND affine_permission_workspace_invitation_state(old.status) IS NOT NULL
          AND affine_permission_legacy_workspace_role(old.type) IS NOT NULL
          AND (
            projected.id IS NULL OR
            projected.workspace_id <> old.workspace_id OR
            projected.invitee_user_id <> old.user_id OR
            projected.requested_role <> CASE WHEN affine_permission_legacy_workspace_role(old.type) = 'admin' THEN 'admin' ELSE 'member' END OR
            projected.status <> affine_permission_workspace_invitation_state(old.status)
          )
      `),
      count(this.db.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::bigint AS count
        FROM workspace_invitations projected
        LEFT JOIN workspace_user_permissions old
          ON old.id = projected.legacy_permission_id
          OR (
            projected.legacy_permission_id IS NULL
            AND old.workspace_id = projected.workspace_id
            AND old.user_id = projected.invitee_user_id
            AND old.status <> 'Accepted'::"WorkspaceMemberStatus"
          )
        WHERE projected.invitee_user_id IS NOT NULL
          AND (
            old.id IS NULL OR
            old.status = 'Accepted'::"WorkspaceMemberStatus" OR
            affine_permission_workspace_invitation_state(old.status) IS NULL OR
            affine_permission_legacy_workspace_role(old.type) IS NULL
          )
      `),
      count(this.db.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::bigint AS count
        FROM workspace_page_user_permissions old
        LEFT JOIN doc_grants projected
          ON projected.workspace_id = old.workspace_id
          AND projected.doc_id = old.page_id
          AND projected.principal_type = 'user'
          AND projected.principal_id = old.user_id
        WHERE affine_permission_legacy_doc_role(old.type) IS NOT NULL
          AND (
            projected.workspace_id IS NULL OR
            projected.role <> affine_permission_legacy_doc_role(old.type)
          )
      `),
      count(this.db.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::bigint AS count
        FROM doc_grants projected
        LEFT JOIN workspace_page_user_permissions old
          ON old.workspace_id = projected.workspace_id
          AND old.page_id = projected.doc_id
          AND old.user_id = projected.principal_id
        WHERE projected.principal_type = 'user'
          AND (
            old.workspace_id IS NULL OR
            affine_permission_legacy_doc_role(old.type) IS NULL
          )
      `),
      count(this.db.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::bigint AS count
        FROM workspace_pages old
        LEFT JOIN doc_access_policies projected
          ON projected.workspace_id = old.workspace_id
          AND projected.doc_id = old.page_id
        WHERE affine_permission_legacy_default_doc_role(old."defaultRole") IS NOT NULL
          AND (
            projected.workspace_id IS NULL OR
            projected.visibility <> CASE WHEN old.public THEN 'public' ELSE 'private' END OR
            projected.public_role IS DISTINCT FROM CASE WHEN old.public THEN 'external' ELSE NULL END OR
            projected.member_default_role IS DISTINCT FROM affine_permission_legacy_default_doc_role(old."defaultRole")
          )
      `),
      count(this.db.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::bigint AS count
        FROM doc_access_policies projected
        LEFT JOIN workspace_pages old
          ON old.workspace_id = projected.workspace_id
          AND old.page_id = projected.doc_id
        WHERE old.workspace_id IS NULL
      `),
      count(this.db.$queryRaw<CountRow[]>`
        SELECT COALESCE(SUM(conflicts.count - 1), 0)::bigint AS count
        FROM (
          SELECT workspace_id, COUNT(*)::bigint AS count
          FROM workspace_members
          WHERE state = 'active'
            AND role = 'owner'
          GROUP BY workspace_id
          HAVING COUNT(*) > 1
          UNION ALL
          SELECT workspace_id || ':' || doc_id AS workspace_id, COUNT(*)::bigint AS count
          FROM doc_grants
          WHERE principal_type = 'user'
            AND role = 'owner'
          GROUP BY workspace_id, doc_id
          HAVING COUNT(*) > 1
        ) conflicts
      `),
      this.db.$queryRaw<ProjectionIssueRow[]>`
        SELECT category, COUNT(*)::bigint AS count
        FROM (
          SELECT 'unknown_workspace_role' AS category
          FROM workspace_user_permissions
          WHERE affine_permission_legacy_workspace_role(type) IS NULL
            AND type <> -99
          UNION ALL
          SELECT 'unknown_doc_role' AS category
          FROM workspace_page_user_permissions
          WHERE affine_permission_legacy_doc_role(type) IS NULL
            AND type NOT IN (0, -32768)
          UNION ALL
          SELECT 'legacy_doc_external_row' AS category
          FROM workspace_page_user_permissions
          WHERE type = 0
          UNION ALL
          SELECT 'legacy_doc_none_row' AS category
          FROM workspace_page_user_permissions
          WHERE type = -32768
          UNION ALL
          SELECT 'doc_default_owner' AS category
          FROM workspace_pages
          WHERE "defaultRole" = 99
        ) issues
        GROUP BY category
      `,
    ]);

    return {
      oldWorkspacePolicyMismatch,
      oldAcceptedMemberMismatch,
      extraProjectedMember,
      oldInvitationMismatch,
      extraProjectedInvitation,
      oldDocGrantMismatch,
      extraProjectedDocGrant,
      oldDocPolicyMismatch,
      extraProjectedDocPolicy,
      runtimeStateMissing: 0,
      runtimeStateMismatch: 0,
      ownerConflict,
      oldNewDecisionMismatch: 0,
      invalidLegacyRows: Object.fromEntries(
        invalidLegacyRows.map(row => [row.category, Number(row.count)])
      ),
    };
  }

  async lockWorkspaceOwnerTransfer(workspaceId: string) {
    await this.db.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId}, 16))
    `;
  }

  async lockDocOwnerTransfer(workspaceId: string, docId: string) {
    await this.db.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${workspaceId}:${docId}`}, 16))
    `;
  }

  async markNewWriteOrigin() {
    await this.db.$executeRaw`
      SELECT set_config('affine.permission_sync_origin', 'new', true)
    `;
  }

  async markLegacyWriteOrigin() {
    await this.db.$executeRaw`
      SELECT set_config('affine.permission_sync_origin', 'legacy', true)
    `;
  }
}
