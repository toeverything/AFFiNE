import assert from 'node:assert';

import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { WorkspaceMemberSource, WorkspaceMemberStatus } from '@prisma/client';

import { CanNotBatchGrantDocOwnerPermissions } from '../base';
import { BaseModel } from './base';
import { DocRole, WorkspaceRole } from './common';

type WorkspaceMemberRole = 'owner' | 'admin' | 'member';
type WorkspaceInvitationStatus = 'pending' | 'waiting_review' | 'waiting_seat';
type WorkspaceInvitationKind = 'email' | 'link';
type PermissionSource = 'email' | 'link' | 'legacy';
type DocGrantRole = 'owner' | 'manager' | 'editor' | 'commenter' | 'reader';

export function workspaceRoleToNew(role: WorkspaceRole): WorkspaceMemberRole {
  switch (role) {
    case WorkspaceRole.Owner:
      return 'owner';
    case WorkspaceRole.Admin:
      return 'admin';
    case WorkspaceRole.Collaborator:
      return 'member';
    default:
      throw new Error(
        `Unsupported workspace role for new permission model: ${role}`
      );
  }
}

export function workspaceRoleFromNew(role: WorkspaceMemberRole): WorkspaceRole {
  switch (role) {
    case 'owner':
      return WorkspaceRole.Owner;
    case 'admin':
      return WorkspaceRole.Admin;
    case 'member':
      return WorkspaceRole.Collaborator;
  }
}

export function workspaceStatusFromNew(
  state: 'active' | WorkspaceInvitationStatus
): WorkspaceMemberStatus {
  switch (state) {
    case 'active':
      return WorkspaceMemberStatus.Accepted;
    case 'pending':
      return WorkspaceMemberStatus.Pending;
    case 'waiting_review':
      return WorkspaceMemberStatus.UnderReview;
    case 'waiting_seat':
      return WorkspaceMemberStatus.NeedMoreSeat;
  }
}

export function workspaceSourceToNew(
  source?: WorkspaceMemberSource
): PermissionSource {
  switch (source) {
    case WorkspaceMemberSource.Email:
      return 'email';
    case WorkspaceMemberSource.Link:
      return 'link';
    default:
      return 'legacy';
  }
}

export function workspaceSourceFromNew(
  source?: PermissionSource | WorkspaceInvitationKind
): WorkspaceMemberSource {
  return source === 'link'
    ? WorkspaceMemberSource.Link
    : WorkspaceMemberSource.Email;
}

export function workspaceStatusToInvitationState(
  status: WorkspaceMemberStatus
): WorkspaceInvitationStatus | null {
  switch (status) {
    case WorkspaceMemberStatus.Pending:
      return 'pending';
    case WorkspaceMemberStatus.UnderReview:
      return 'waiting_review';
    case WorkspaceMemberStatus.AllocatingSeat:
    case WorkspaceMemberStatus.NeedMoreSeat:
    case WorkspaceMemberStatus.NeedMoreSeatAndReview:
      return 'waiting_seat';
    default:
      return null;
  }
}

export function docRoleToNew(role: DocRole): DocGrantRole {
  switch (role) {
    case DocRole.Owner:
      return 'owner';
    case DocRole.Manager:
      return 'manager';
    case DocRole.Editor:
      return 'editor';
    case DocRole.Commenter:
      return 'commenter';
    case DocRole.Reader:
      return 'reader';
    default:
      throw new Error(
        `Unsupported doc grant role for new permission model: ${role}`
      );
  }
}

function workspaceInvitationKindToNew(
  source?: WorkspaceMemberSource
): WorkspaceInvitationKind {
  return source === WorkspaceMemberSource.Link ? 'link' : 'email';
}

export function docRoleFromNew(role: DocGrantRole): DocRole {
  switch (role) {
    case 'owner':
      return DocRole.Owner;
    case 'manager':
      return DocRole.Manager;
    case 'editor':
      return DocRole.Editor;
    case 'commenter':
      return DocRole.Commenter;
    case 'reader':
      return DocRole.Reader;
  }
}

@Injectable()
export class WorkspaceMemberModel extends BaseModel {
  @Transactional()
  async setOwner(
    workspaceId: string,
    userId: string,
    fallbackRole: WorkspaceRole
  ) {
    await this.models.permissionProjection.markNewWriteOrigin();
    await this.models.permissionProjection.lockWorkspaceOwnerTransfer(
      workspaceId
    );
    const ownerCount = await this.db.workspaceMember.count({
      where: { workspaceId, role: 'owner', state: 'active' },
    });
    if (ownerCount > 0) {
      const target = await this.db.workspaceMember.findFirst({
        where: { workspaceId, userId, state: 'active' },
      });
      if (!target) {
        throw new Error('New workspace owner must be an active member.');
      }
    }

    await this.db.workspaceMember.updateMany({
      where: {
        workspaceId,
        role: 'owner',
        userId: { not: userId },
        state: 'active',
      },
      data: {
        role: workspaceRoleToNew(fallbackRole),
        source: 'legacy',
      },
    });

    return await this.db.workspaceMember.upsert({
      where: {
        workspaceId_userId_state: {
          workspaceId,
          userId,
          state: 'active',
        },
      },
      update: {
        role: 'owner',
        source: 'legacy',
      },
      create: {
        workspaceId,
        userId,
        role: 'owner',
        state: 'active',
        source: 'legacy',
      },
    });
  }

  @Transactional()
  async setActive(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    data: { legacyPermissionId?: string | null; source?: PermissionSource } = {}
  ) {
    await this.models.permissionProjection.markNewWriteOrigin();
    if (role === WorkspaceRole.Owner) {
      throw new Error('Cannot grant Owner role of a workspace to a user.');
    }

    await this.db.workspaceInvitation.deleteMany({
      where: { workspaceId, inviteeUserId: userId },
    });

    return await this.db.workspaceMember.upsert({
      where: {
        workspaceId_userId_state: {
          workspaceId,
          userId,
          state: 'active',
        },
      },
      update: {
        role: workspaceRoleToNew(role),
        legacyPermissionId: data.legacyPermissionId,
        source: data.source,
      },
      create: {
        workspaceId,
        userId,
        role: workspaceRoleToNew(role),
        state: 'active',
        source: data.source ?? 'legacy',
        legacyPermissionId: data.legacyPermissionId,
      },
    });
  }

  @Transactional()
  async delete(workspaceId: string, userId: string) {
    await this.models.permissionProjection.markNewWriteOrigin();
    await this.db.$queryRaw`
      SELECT id
      FROM workspace_members
      WHERE workspace_id = ${workspaceId}
        AND role = 'owner'
        AND state = 'active'
      FOR UPDATE
    `;
    const existingOwners = await this.db.workspaceMember.count({
      where: {
        workspaceId,
        role: 'owner',
        state: 'active',
        userId: { not: userId },
      },
    });
    const deletingOwner = await this.db.workspaceMember.count({
      where: {
        workspaceId,
        userId,
        role: 'owner',
        state: 'active',
      },
    });

    if (deletingOwner > 0 && existingOwners === 0) {
      throw new Error('Cannot remove the last active workspace owner.');
    }

    return await this.db.workspaceMember.deleteMany({
      where: { workspaceId, userId, state: 'active' },
    });
  }
}

@Injectable()
export class WorkspaceInvitationModel extends BaseModel {
  private hasCurrentColumns?: Promise<boolean>;

  @Transactional()
  async set(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    status: WorkspaceMemberStatus,
    data: {
      source?: WorkspaceMemberSource;
      inviterId?: string;
    } = {}
  ): Promise<void> {
    await this.models.permissionProjection.markNewWriteOrigin();
    if (role === WorkspaceRole.Owner) {
      throw new Error('Cannot grant Owner role of a workspace to a user.');
    }

    const invitationStatus = workspaceStatusToInvitationState(status);
    if (!invitationStatus) {
      await this.models.workspaceMember.setActive(workspaceId, userId, role);
      return;
    }

    await this.db.workspaceMember.deleteMany({
      where: { workspaceId, userId, state: 'active' },
    });

    await this.upsertInvitation({
      workspaceId,
      userId,
      inviterId: data.inviterId,
      requestedRole: role === WorkspaceRole.Admin ? 'admin' : 'member',
      status: invitationStatus,
      kind: workspaceInvitationKindToNew(data.source),
      source: workspaceSourceToNew(data.source),
    });
  }

  @Transactional()
  async setState(
    workspaceId: string,
    userId: string,
    status: WorkspaceMemberStatus,
    data: {
      inviterId?: string;
    } = {}
  ) {
    await this.models.permissionProjection.markNewWriteOrigin();
    const invitationStatus = workspaceStatusToInvitationState(status);
    if (!invitationStatus) {
      const invitation = await this.findInvitation(workspaceId, userId);
      if (!invitation) {
        throw new Error('Cannot activate a missing workspace invitation.');
      }
      const role =
        invitation.requestedRole === 'admin'
          ? WorkspaceRole.Admin
          : WorkspaceRole.Collaborator;
      return await this.models.workspaceMember.setActive(
        workspaceId,
        userId,
        role,
        {
          legacyPermissionId: invitation.legacyPermissionId,
          source: invitation.source,
        }
      );
    }

    return await this.updateInvitationStatus({
      workspaceId,
      userId,
      status: invitationStatus,
      inviterId: data.inviterId,
    });
  }

  @Transactional()
  async deleteNonAccepted(workspaceId: string) {
    await this.models.permissionProjection.markNewWriteOrigin();
    return await this.db.workspaceInvitation.deleteMany({
      where: { workspaceId },
    });
  }

  @Transactional()
  async cancelPendingByActor(actorUserId: string) {
    await this.models.permissionProjection.markNewWriteOrigin();
    return await this.db.workspaceInvitation.deleteMany({
      where: {
        inviterUserId: actorUserId,
        status: {
          in: ['pending', 'waiting_review', 'waiting_seat'],
        },
      },
    });
  }

  @Transactional()
  async cancelPendingByWorkspace(workspaceId: string) {
    await this.models.permissionProjection.markNewWriteOrigin();
    return await this.db.workspaceInvitation.deleteMany({
      where: {
        workspaceId,
        status: {
          in: ['pending', 'waiting_review', 'waiting_seat'],
        },
      },
    });
  }

  private async supportsCurrentInvitationColumns() {
    this.hasCurrentColumns ??= this.db.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'workspace_invitations'
            AND column_name = 'requested_role'
        ) AS "exists"
      `.then(rows => rows[0]?.exists ?? false);
    return await this.hasCurrentColumns;
  }

  private async upsertInvitation(input: {
    workspaceId: string;
    userId: string;
    inviterId?: string;
    requestedRole: 'admin' | 'member';
    status: WorkspaceInvitationStatus;
    kind: WorkspaceInvitationKind;
    source: PermissionSource;
  }) {
    if (await this.supportsCurrentInvitationColumns()) {
      return await this.db.$executeRaw`
        INSERT INTO workspace_invitations (
          workspace_id,
          invitee_user_id,
          inviter_user_id,
          requested_role,
          status,
          kind,
          updated_at
        )
        VALUES (
          ${input.workspaceId},
          ${input.userId},
          ${input.inviterId ?? null},
          ${input.requestedRole},
          ${input.status},
          ${input.kind},
          now()
        )
        ON CONFLICT (workspace_id, invitee_user_id)
        DO UPDATE SET
          inviter_user_id = EXCLUDED.inviter_user_id,
          requested_role = EXCLUDED.requested_role,
          status = EXCLUDED.status,
          kind = EXCLUDED.kind,
          updated_at = now()
      `;
    }

    return await this.db.$executeRaw`
      INSERT INTO workspace_invitations (
        workspace_id,
        invitee_user_id,
        inviter_id,
        role,
        state,
        source,
        updated_at
      )
      VALUES (
        ${input.workspaceId},
        ${input.userId},
        ${input.inviterId ?? null},
        ${input.requestedRole},
        ${input.status},
        ${input.source},
        now()
      )
      ON CONFLICT (workspace_id, invitee_user_id)
      DO UPDATE SET
        inviter_id = EXCLUDED.inviter_id,
        role = EXCLUDED.role,
        state = EXCLUDED.state,
        source = EXCLUDED.source,
        updated_at = now()
    `;
  }

  private async findInvitation(workspaceId: string, userId: string) {
    if (await this.supportsCurrentInvitationColumns()) {
      const rows = await this.db.$queryRaw<
        Array<{
          requestedRole: 'admin' | 'member';
          legacyPermissionId: string | null;
          source: PermissionSource;
        }>
      >`
        SELECT
          requested_role AS "requestedRole",
          legacy_permission_id AS "legacyPermissionId",
          kind AS source
        FROM workspace_invitations
        WHERE workspace_id = ${workspaceId}
          AND invitee_user_id = ${userId}
        LIMIT 1
      `;
      return rows[0] ?? null;
    }

    const rows = await this.db.$queryRaw<
      Array<{
        requestedRole: 'admin' | 'member';
        legacyPermissionId: string | null;
        source: PermissionSource;
      }>
    >`
      SELECT
        role AS "requestedRole",
        legacy_permission_id AS "legacyPermissionId",
        source
      FROM workspace_invitations
      WHERE workspace_id = ${workspaceId}
        AND invitee_user_id = ${userId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async updateInvitationStatus(input: {
    workspaceId: string;
    userId: string;
    status: WorkspaceInvitationStatus;
    inviterId?: string;
  }) {
    if (await this.supportsCurrentInvitationColumns()) {
      return await this.db.$executeRaw`
        UPDATE workspace_invitations
        SET
          status = ${input.status},
          inviter_user_id = ${input.inviterId ?? null},
          updated_at = now()
        WHERE workspace_id = ${input.workspaceId}
          AND invitee_user_id = ${input.userId}
      `;
    }

    return await this.db.$executeRaw`
      UPDATE workspace_invitations
      SET
        state = ${input.status},
        inviter_id = ${input.inviterId ?? null},
        updated_at = now()
      WHERE workspace_id = ${input.workspaceId}
        AND invitee_user_id = ${input.userId}
    `;
  }
}

@Injectable()
export class WorkspaceAccessPolicyModel extends BaseModel {
  @Transactional()
  async upsert(
    workspaceId: string,
    policy: {
      public?: boolean;
      enableSharing?: boolean;
      enableUrlPreview?: boolean;
    }
  ) {
    await this.models.permissionProjection.markNewWriteOrigin();
    return await this.db.workspaceAccessPolicy.upsert({
      where: { workspaceId },
      update: {
        visibility:
          policy.public === undefined
            ? undefined
            : policy.public
              ? 'public'
              : 'private',
        sharingEnabled: policy.enableSharing,
        urlPreviewEnabled: policy.enableUrlPreview,
      },
      create: {
        workspaceId,
        visibility: policy.public ? 'public' : 'private',
        sharingEnabled: policy.enableSharing ?? true,
        urlPreviewEnabled: policy.enableUrlPreview ?? false,
      },
    });
  }
}

@Injectable()
export class DocAccessPolicyModel extends BaseModel {
  async hasPublicExternal(workspaceId: string) {
    const count = await this.db.docAccessPolicy.count({
      where: {
        workspaceId,
        visibility: 'public',
        publicRole: 'external',
      },
    });
    return count > 0;
  }

  @Transactional()
  async upsert(
    workspaceId: string,
    docId: string,
    policy: {
      public?: boolean;
      defaultRole?: DocRole;
      publishedAt?: Date | null;
      urlPreviewEnabled?: boolean;
    }
  ) {
    await this.models.permissionProjection.markNewWriteOrigin();
    const publicRole = policy.public ? 'external' : null;
    return await this.db.docAccessPolicy.upsert({
      where: { workspaceId_docId: { workspaceId, docId } },
      update: {
        visibility:
          policy.public === undefined
            ? undefined
            : policy.public
              ? 'public'
              : 'private',
        publicRole: policy.public === undefined ? undefined : publicRole,
        memberDefaultRole:
          policy.defaultRole === undefined
            ? undefined
            : policy.defaultRole === DocRole.None
              ? 'none'
              : docRoleToNew(policy.defaultRole),
        publishedAt: policy.publishedAt,
        urlPreviewEnabled: policy.urlPreviewEnabled,
      },
      create: {
        workspaceId,
        docId,
        visibility: policy.public ? 'public' : 'private',
        publicRole,
        memberDefaultRole:
          policy.defaultRole === undefined
            ? null
            : policy.defaultRole === DocRole.None
              ? 'none'
              : docRoleToNew(policy.defaultRole),
        publishedAt: policy.publishedAt,
        urlPreviewEnabled: policy.urlPreviewEnabled ?? false,
      },
    });
  }
}

@Injectable()
export class DocGrantModel extends BaseModel {
  @Transactional()
  async setOwner(workspaceId: string, docId: string, userId: string) {
    await this.models.permissionProjection.markNewWriteOrigin();
    await this.models.permissionProjection.lockDocOwnerTransfer(
      workspaceId,
      docId
    );
    await this.db.docGrant.updateMany({
      where: {
        workspaceId,
        docId,
        principalType: 'user',
        role: 'owner',
        principalId: { not: userId },
      },
      data: { role: 'manager' },
    });

    return await this.set(workspaceId, docId, userId, DocRole.Owner);
  }

  @Transactional()
  async set(workspaceId: string, docId: string, userId: string, role: DocRole) {
    await this.models.permissionProjection.markNewWriteOrigin();
    assert(role !== DocRole.None && role !== DocRole.External);

    return await this.db.docGrant.upsert({
      where: {
        workspaceId_docId_principalType_principalId: {
          workspaceId,
          docId,
          principalType: 'user',
          principalId: userId,
        },
      },
      update: {
        role: docRoleToNew(role),
      },
      create: {
        workspaceId,
        docId,
        principalType: 'user',
        principalId: userId,
        role: docRoleToNew(role),
      },
    });
  }

  @Transactional()
  async batchSetUserRoles(
    workspaceId: string,
    docId: string,
    userIds: string[],
    role: DocRole
  ) {
    await this.models.permissionProjection.markNewWriteOrigin();
    if (role === DocRole.Owner) {
      throw new CanNotBatchGrantDocOwnerPermissions();
    }
    if (userIds.length === 0) {
      return 0;
    }

    const grantRole = docRoleToNew(role);
    for (const userId of userIds) {
      await this.db.docGrant.upsert({
        where: {
          workspaceId_docId_principalType_principalId: {
            workspaceId,
            docId,
            principalType: 'user',
            principalId: userId,
          },
        },
        update: {
          role: grantRole,
        },
        create: {
          workspaceId,
          docId,
          principalType: 'user',
          principalId: userId,
          role: grantRole,
        },
      });
    }
    return userIds.length;
  }

  @Transactional()
  async delete(workspaceId: string, docId: string, userId: string) {
    await this.models.permissionProjection.markNewWriteOrigin();
    await this.db.$queryRaw`
      SELECT 1
      FROM doc_grants
      WHERE workspace_id = ${workspaceId}
        AND doc_id = ${docId}
        AND principal_type = 'user'
        AND role = 'owner'
      FOR UPDATE
    `;
    const deletingOwner = await this.db.docGrant.count({
      where: {
        workspaceId,
        docId,
        principalType: 'user',
        principalId: userId,
        role: 'owner',
      },
    });
    const otherOwners = await this.db.docGrant.count({
      where: {
        workspaceId,
        docId,
        principalType: 'user',
        principalId: { not: userId },
        role: 'owner',
      },
    });
    if (deletingOwner > 0 && otherOwners === 0) {
      throw new Error('Cannot remove the last doc owner grant.');
    }

    return await this.db.docGrant.deleteMany({
      where: {
        workspaceId,
        docId,
        principalType: 'user',
        principalId: userId,
      },
    });
  }
}
