import { Injectable, Optional } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { Models } from '../../models';
import {
  PermissionContextLoader,
  type PermissionDocAction,
  type PermissionWorkspaceAction,
} from './context-loader';
import { PermissionService } from './service';

type ProjectionDecisionSample = {
  category: string;
  workspaceId: string;
  docId: string | null;
  userId: string | null;
  workspaceActions: string[] | null;
  docActions: string[] | null;
};

@Injectable()
export class PermissionProjectionChecker {
  constructor(
    private readonly db: PrismaClient,
    private readonly models: Models,
    @Optional()
    private readonly loader?: PermissionContextLoader,
    @Optional()
    private readonly permission?: PermissionService
  ) {}

  async checkLegacyProjection() {
    const report =
      await this.models.permissionProjection.checkLegacyProjection();
    return {
      ...report,
      oldNewDecisionMismatch: await this.checkOldNewLoaderDecisionMismatch(),
    };
  }

  private async checkOldNewLoaderDecisionMismatch() {
    const { loader, permission } = this;
    if (!loader || !permission) {
      return 0;
    }

    const samples = await this.db.$queryRaw<ProjectionDecisionSample[]>`
      (
        SELECT
          'active_member_doc' AS category,
          old_member.workspace_id AS "workspaceId",
          old_doc.page_id AS "docId",
          old_member.user_id AS "userId",
          NULL::text[] AS "workspaceActions",
          ARRAY['Doc.Read', 'Doc.Preview']::text[] AS "docActions"
        FROM workspace_user_permissions old_member
        INNER JOIN workspace_pages old_doc
          ON old_doc.workspace_id = old_member.workspace_id
        WHERE old_member.status = 'Accepted'::"WorkspaceMemberStatus"
          AND affine_permission_legacy_workspace_role(old_member.type) IS NOT NULL
          AND affine_permission_legacy_default_doc_role(old_doc."defaultRole") IS NOT NULL
        ORDER BY md5(old_member.workspace_id || ':' || old_doc.page_id || ':' || old_member.user_id)
        LIMIT 80
      )
      UNION ALL
      (
        SELECT
          'workspace_invitation' AS category,
          old_member.workspace_id AS "workspaceId",
          NULL::text AS "docId",
          old_member.user_id AS "userId",
          ARRAY['Workspace.Read']::text[] AS "workspaceActions",
          NULL::text[] AS "docActions"
        FROM workspace_user_permissions old_member
        WHERE old_member.status <> 'Accepted'::"WorkspaceMemberStatus"
          AND affine_permission_workspace_invitation_state(old_member.status) IS NOT NULL
          AND affine_permission_legacy_workspace_role(old_member.type) IS NOT NULL
        ORDER BY md5(old_member.workspace_id || ':' || old_member.user_id)
        LIMIT 40
      )
      UNION ALL
      (
        SELECT
          'public_doc_anonymous' AS category,
          old_doc.workspace_id AS "workspaceId",
          old_doc.page_id AS "docId",
          NULL::text AS "userId",
          NULL::text[] AS "workspaceActions",
          ARRAY['Doc.Read', 'Doc.Preview']::text[] AS "docActions"
        FROM workspace_pages old_doc
        WHERE old_doc.public
          AND affine_permission_legacy_default_doc_role(old_doc."defaultRole") IS NOT NULL
        ORDER BY md5(old_doc.workspace_id || ':' || old_doc.page_id)
        LIMIT 40
      )
      UNION ALL
      (
        SELECT
          'workspace_url_preview_private_doc' AS category,
          old_doc.workspace_id AS "workspaceId",
          old_doc.page_id AS "docId",
          NULL::text AS "userId",
          NULL::text[] AS "workspaceActions",
          ARRAY['Doc.Preview', 'Doc.Read']::text[] AS "docActions"
        FROM workspace_pages old_doc
        INNER JOIN workspaces old_workspace
          ON old_workspace.id = old_doc.workspace_id
        WHERE old_workspace.enable_sharing
          AND old_workspace.enable_url_preview
          AND NOT old_doc.public
          AND affine_permission_legacy_default_doc_role(old_doc."defaultRole") IS NOT NULL
        ORDER BY md5(old_doc.workspace_id || ':' || old_doc.page_id)
        LIMIT 40
      )
      UNION ALL
      (
        SELECT
          'explicit_doc_grant' AS category,
          old_grant.workspace_id AS "workspaceId",
          old_grant.page_id AS "docId",
          old_grant.user_id AS "userId",
          NULL::text[] AS "workspaceActions",
          ARRAY['Doc.Read', 'Doc.Update', 'Doc.Users.Manage', 'Doc.TransferOwner']::text[] AS "docActions"
        FROM workspace_page_user_permissions old_grant
        WHERE affine_permission_legacy_doc_role(old_grant.type) IS NOT NULL
        ORDER BY md5(old_grant.workspace_id || ':' || old_grant.page_id || ':' || old_grant.user_id)
        LIMIT 80
      )
    `;

    let mismatches = 0;
    for (const sample of samples) {
      const input = {
        userId: sample.userId ?? undefined,
        workspaceId: sample.workspaceId,
        workspaceActions: sample.workspaceActions as
          | PermissionWorkspaceAction[]
          | undefined,
        docs:
          sample.docId && sample.docActions
            ? [
                {
                  docId: sample.docId,
                  actions: sample.docActions as PermissionDocAction[],
                },
              ]
            : undefined,
      };
      const [legacy, projection] = await Promise.all([
        loader.load(input).then(input => permission.evaluate(input)),
        loader
          .loadFromNewTables(input)
          .then(input => permission.evaluate(input)),
      ]);
      if (
        JSON.stringify(legacy.workspace) !==
          JSON.stringify(projection.workspace) ||
        JSON.stringify(legacy.docs) !== JSON.stringify(projection.docs)
      ) {
        mismatches += 1;
      }
    }

    return mismatches;
  }
}
