import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { permissionActionRoleMatrixV1 } from '../../native';
import { type DocAction, DocRole, WorkspaceRole } from './types';

export type PermissionSqlPredicate = {
  sql: string;
  params: unknown[];
};

type RawDocIdColumn = 'doc_id' | 'docs.id';

@Injectable()
export class PermissionSqlPredicateBuilder {
  private readonly matrix = permissionActionRoleMatrixV1() as {
    doc?: { roles?: Record<string, string[]> };
    workspace?: { roles?: Record<string, string[]> };
  };

  private readonly legacyDocRoleValues = new Map<string, DocRole>([
    ['external', DocRole.External],
    ['reader', DocRole.Reader],
    ['commenter', DocRole.Commenter],
    ['editor', DocRole.Editor],
    ['manager', DocRole.Manager],
    ['owner', DocRole.Owner],
  ]);

  private readonly legacyWorkspaceRoleValues = new Map<string, number>([
    ['member', WorkspaceRole.Collaborator],
    ['admin', WorkspaceRole.Admin],
    ['owner', WorkspaceRole.Owner],
  ]);

  private docRolesForAction(action: DocAction) {
    return Object.entries(this.matrix.doc?.roles ?? {})
      .filter(([, actions]) => actions.includes(action))
      .map(([role]) => role)
      .filter(role => role !== 'none');
  }

  private inheritedWorkspaceRolesForDocAction(action: DocAction) {
    const docRoles = new Set(this.docRolesForAction(action));
    return [
      docRoles.has('owner') ? 'owner' : null,
      docRoles.has('manager') ? 'admin' : null,
    ].filter((role): role is string => role !== null);
  }

  private nonMemberDocGrantRolesForAction(action: DocAction) {
    const roles = new Set(this.docRolesForAction(action));
    roles.delete('external');
    roles.delete('manager');
    roles.delete('owner');
    if (roles.has('editor')) {
      roles.add('manager');
      roles.add('owner');
    }
    return [...roles];
  }

  private legacyNonMemberDocGrantRolesForAction(action: DocAction) {
    return this.nonMemberDocGrantRolesForAction(action)
      .map(role => this.legacyDocRoleValues.get(role))
      .filter(role => role !== undefined);
  }

  private rawDocIdColumn(column: RawDocIdColumn = 'doc_id') {
    switch (column) {
      case 'doc_id':
      case 'docs.id':
        return column;
      default:
        throw new Error(`Unsupported doc id column: ${column}`);
    }
  }

  docReadableByLegacyTables(input: {
    workspaceId: string;
    userId: string;
    action: DocAction;
    docIdColumn?: RawDocIdColumn;
  }): PermissionSqlPredicate {
    const roles = this.docRolesForAction(input.action)
      .map(role => this.legacyDocRoleValues.get(role))
      .filter(role => role !== undefined);
    const grantRoles = roles.filter(role => role !== DocRole.External);
    const nonMemberGrantRoles = this.legacyNonMemberDocGrantRolesForAction(
      input.action
    );
    const legacyActiveMemberRoles = [
      WorkspaceRole.Collaborator,
      WorkspaceRole.Admin,
      WorkspaceRole.Owner,
    ];
    const inheritedWorkspaceRoles = this.inheritedWorkspaceRolesForDocAction(
      input.action
    )
      .map(role => this.legacyWorkspaceRoleValues.get(role))
      .filter(role => role !== undefined);
    const docIdColumn = this.rawDocIdColumn(input.docIdColumn);

    return {
      sql: [
        `EXISTS (SELECT 1 FROM workspaces w`,
        `LEFT JOIN workspace_pages wp ON wp.workspace_id = w.id`,
        `AND wp.page_id = ${docIdColumn}`,
        `LEFT JOIN workspace_user_permissions wup ON wup.workspace_id = w.id`,
        `AND wup.user_id = ? AND wup.status = 'Accepted'`,
        `LEFT JOIN workspace_page_user_permissions p ON p.workspace_id = w.id`,
        `AND p.user_id = ? AND p.page_id = ${docIdColumn}`,
        `WHERE w.id = ? AND (`,
        `(wup.type = ANY(?::smallint[]) AND p.type = ANY(?::smallint[]))`,
        `OR ((wup.id IS NULL OR wup.type <> ALL(?::smallint[])) AND w.enable_sharing AND p.type = ANY(?::smallint[]))`,
        `OR wup.type = ANY(?::smallint[])`,
        `OR (wup.type = ANY(?::smallint[]) AND (p.user_id IS NULL OR p.type IN (?, ?))`,
        `AND COALESCE(wp."defaultRole", 30) = ANY(?::smallint[]))`,
        `OR (w.enable_sharing AND wp.public AND ? = ANY(?::smallint[]))`,
        `))`,
      ].join(' '),
      params: [
        input.userId,
        input.userId,
        input.workspaceId,
        legacyActiveMemberRoles,
        grantRoles,
        legacyActiveMemberRoles,
        nonMemberGrantRoles,
        inheritedWorkspaceRoles,
        legacyActiveMemberRoles,
        DocRole.None,
        DocRole.External,
        grantRoles,
        DocRole.External,
        roles,
      ],
    };
  }

  docReadableByLegacyTablesSql(input: {
    workspaceId: string;
    userId: string;
    action: DocAction;
    docIdColumn?: Prisma.Sql;
  }): Prisma.Sql {
    const docRoles = this.docRolesForAction(input.action);
    const legacyDocRoles = docRoles
      .map(role => this.legacyDocRoleValues.get(role))
      .filter(role => role !== undefined);
    const legacyGrantRoles = legacyDocRoles.filter(
      role => role !== DocRole.External
    );
    const legacyNonMemberGrantRoles =
      this.legacyNonMemberDocGrantRolesForAction(input.action);
    const inheritedWorkspaceRoles = this.inheritedWorkspaceRolesForDocAction(
      input.action
    )
      .map(role => this.legacyWorkspaceRoleValues.get(role))
      .filter(role => role !== undefined);
    const legacyActiveMemberRoles = [
      WorkspaceRole.Collaborator,
      WorkspaceRole.Admin,
      WorkspaceRole.Owner,
    ];
    const docIdColumn = input.docIdColumn ?? Prisma.raw('doc_id');

    return Prisma.sql`
      EXISTS (
        SELECT 1
        FROM workspaces w
        LEFT JOIN workspace_pages wp
          ON wp.workspace_id = w.id
         AND wp.page_id = ${docIdColumn}
        LEFT JOIN workspace_user_permissions wup
          ON wup.workspace_id = w.id
         AND wup.user_id = ${input.userId}
         AND wup.status = 'Accepted'::"WorkspaceMemberStatus"
        LEFT JOIN workspace_page_user_permissions p
          ON p.workspace_id = w.id
         AND p.page_id = ${docIdColumn}
         AND p.user_id = ${input.userId}
        WHERE w.id = ${input.workspaceId}
          AND (
            (
              wup.type = ANY(${Prisma.sql`${legacyActiveMemberRoles}::smallint[]`})
              AND p.type = ANY(${Prisma.sql`${legacyGrantRoles}::smallint[]`})
            )
            OR (
              (
                wup.id IS NULL
                OR wup.type <> ALL(${Prisma.sql`${legacyActiveMemberRoles}::smallint[]`})
              )
              AND w.enable_sharing
              AND p.type = ANY(${Prisma.sql`${legacyNonMemberGrantRoles}::smallint[]`})
            )
            OR wup.type = ANY(${Prisma.sql`${inheritedWorkspaceRoles}::smallint[]`})
            OR (
              wup.type = ANY(${Prisma.sql`${legacyActiveMemberRoles}::smallint[]`})
              AND (
                p.user_id IS NULL
                OR p.type IN (${DocRole.None}, ${DocRole.External})
              )
              AND COALESCE(wp."defaultRole", 30) = ANY(${Prisma.sql`${legacyGrantRoles}::smallint[]`})
            )
            OR (
              w.enable_sharing
              AND wp.public
              AND 0 = ANY(${Prisma.sql`${legacyDocRoles}::smallint[]`})
            )
          )
      )
    `;
  }

  docReadableByNewTables(input: {
    workspaceId: string;
    userId?: string;
    action: DocAction;
    docIdColumn?: RawDocIdColumn;
  }): PermissionSqlPredicate {
    const docRoles = this.docRolesForAction(input.action);
    const inheritedWorkspaceRoles = this.inheritedWorkspaceRolesForDocAction(
      input.action
    );
    const grantRoles = docRoles.filter(role => role !== 'external');
    const nonMemberGrantRoles = this.nonMemberDocGrantRolesForAction(
      input.action
    );
    const docIdColumn = this.rawDocIdColumn(input.docIdColumn);

    return {
      sql: [
        `EXISTS (SELECT 1 FROM workspace_access_policies wap`,
        `LEFT JOIN doc_access_policies dap ON dap.workspace_id = wap.workspace_id`,
        `AND dap.doc_id = ${docIdColumn}`,
        `LEFT JOIN workspace_members wm ON wm.workspace_id = wap.workspace_id`,
        `AND wm.user_id = ? AND wm.state = 'active'`,
        `LEFT JOIN doc_grants dg ON dg.workspace_id = wap.workspace_id`,
        `AND dg.doc_id = ${docIdColumn} AND dg.principal_type = 'user' AND dg.principal_id = ?`,
        `WHERE wap.workspace_id = ?`,
        `AND (`,
        `(wm.id IS NOT NULL AND dg.role = ANY(?::text[]))`,
        `OR (wm.id IS NULL AND wap.sharing_enabled AND dg.role = ANY(?::text[]))`,
        `OR wm.role = ANY(?::text[])`,
        `OR (wm.id IS NOT NULL AND dg.principal_id IS NULL AND COALESCE(dap.member_default_role, wap.member_default_doc_role) = ANY(?::text[]))`,
        `OR (wap.sharing_enabled AND dap.visibility = 'public' AND dap.public_role = ANY(?::text[]))`,
        `))`,
      ].join(' '),
      params: [
        input.userId,
        input.userId,
        input.workspaceId,
        grantRoles,
        nonMemberGrantRoles,
        inheritedWorkspaceRoles,
        grantRoles,
        docRoles,
      ],
    };
  }

  docReadableByNewTablesSql(input: {
    workspaceId: string;
    userId?: string;
    action: DocAction;
    docIdColumn?: Prisma.Sql;
  }): Prisma.Sql {
    const docRoles = this.docRolesForAction(input.action);
    const grantRoles = docRoles.filter(role => role !== 'external');
    const nonMemberGrantRoles = this.nonMemberDocGrantRolesForAction(
      input.action
    );
    const inheritedWorkspaceRoles = this.inheritedWorkspaceRolesForDocAction(
      input.action
    );
    const docIdColumn = input.docIdColumn ?? Prisma.raw('doc_id');

    return Prisma.sql`
      EXISTS (
        SELECT 1
        FROM workspace_access_policies wap
        LEFT JOIN doc_access_policies dap
          ON dap.workspace_id = wap.workspace_id
         AND dap.doc_id = ${docIdColumn}
        LEFT JOIN workspace_members wm
          ON wm.workspace_id = wap.workspace_id
         AND wm.user_id = ${input.userId}
         AND wm.state = 'active'
        LEFT JOIN doc_grants dg
          ON dg.workspace_id = wap.workspace_id
         AND dg.doc_id = ${docIdColumn}
         AND dg.principal_type = 'user'
         AND dg.principal_id = ${input.userId}
        WHERE wap.workspace_id = ${input.workspaceId}
          AND (
            (wm.id IS NOT NULL AND dg.role = ANY(${Prisma.sql`${grantRoles}::text[]`}))
            OR (wm.id IS NULL AND wap.sharing_enabled AND dg.role = ANY(${Prisma.sql`${nonMemberGrantRoles}::text[]`}))
            OR wm.role = ANY(${Prisma.sql`${inheritedWorkspaceRoles}::text[]`})
            OR (wm.id IS NOT NULL AND dg.principal_id IS NULL AND COALESCE(dap.member_default_role, wap.member_default_doc_role) = ANY(${Prisma.sql`${grantRoles}::text[]`}))
            OR (wap.sharing_enabled AND dap.visibility = 'public' AND dap.public_role = ANY(${Prisma.sql`${docRoles}::text[]`}))
          )
      )
    `;
  }
}
