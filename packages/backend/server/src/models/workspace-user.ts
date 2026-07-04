import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import {
  Prisma,
  WorkspaceMemberSource,
  WorkspaceMemberStatus,
  WorkspaceUserRole,
} from '@prisma/client';

import { EventBus, NewOwnerIsNotActiveMember, PaginationInput } from '../base';
import { BaseModel } from './base';
import { WorkspaceRole, workspaceUserSelect } from './common';
import {
  allocateWorkspaceSeats,
  countChargedWorkspaceUsers,
  countWorkspaceUsers,
  findUserActiveWorkspaceRoles,
  hasSharedWorkspace,
  queryCompatRows,
  searchCompatRows,
  workspaceInvitationToCompat,
  workspaceMemberToCompat,
} from './workspace-user-compat';

export { WorkspaceMemberStatus };

export type AdminWorkspaceMember = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: 'Owner' | 'Admin' | 'Collaborator';
  status: WorkspaceMemberStatus;
};

declare global {
  interface Events {
    'workspace.owner.changed': {
      workspaceId: string;
      from: string;
      to: string;
    };
    'workspace.members.roleChanged': {
      userId: string;
      workspaceId: string;
      role: WorkspaceRole;
    };
  }
}

@Injectable()
export class WorkspaceUserModel extends BaseModel {
  constructor(private readonly event: EventBus) {
    super();
  }

  /**
   * Set or update the [Owner] of a workspace.
   * The old [Owner] will be changed to [Admin] for team workspace and
   * [Collaborator] for owned workspace if there is already an [Owner].
   */
  @Transactional()
  async setOwner(workspaceId: string, userId: string) {
    const oldOwner = await this.db.workspaceMember.findFirst({
      include: {
        user: {
          select: workspaceUserSelect,
        },
      },
      where: {
        workspaceId,
        role: 'owner',
        state: 'active',
      },
    });
    const fallbackRole = (await this.models.workspace.isTeamWorkspace(
      workspaceId
    ))
      ? WorkspaceRole.Admin
      : WorkspaceRole.Collaborator;

    try {
      await this.models.workspaceMember.setOwner(
        workspaceId,
        userId,
        fallbackRole
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'New workspace owner must be an active member.'
      ) {
        throw new NewOwnerIsNotActiveMember();
      }
      throw error;
    }

    if (oldOwner?.user && oldOwner.user.id !== userId) {
      this.event.emit('workspace.owner.changed', {
        workspaceId,
        from: oldOwner.user.id,
        to: userId,
      });
      this.logger.log(
        `Transfer workspace owner of [${workspaceId}] from [${oldOwner.user.id}] to [${userId}]`
      );
    } else {
      this.logger.log(`Set workspace owner of [${workspaceId}] to [${userId}]`);
    }
  }

  /**
   * Set or update the Role of a user in a workspace.
   *
   * NOTE: do not use this method to set the [Owner] of a workspace. Use {@link setOwner} instead.
   */
  @Transactional()
  async set(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    defaultData: {
      status?: WorkspaceMemberStatus;
      source?: WorkspaceMemberSource;
      inviterId?: string;
    } = {}
  ) {
    const oldRole = await this.get(workspaceId, userId);

    if (role === WorkspaceRole.External) {
      return await this.setExternal(workspaceId, userId, oldRole);
    }

    if (oldRole) {
      if (oldRole.type === role) {
        return oldRole;
      }

      const status = defaultData.status ?? oldRole.status;
      if (status === WorkspaceMemberStatus.Accepted) {
        await this.models.workspaceMember.setActive(workspaceId, userId, role);
      } else {
        await this.models.workspaceInvitation.set(
          workspaceId,
          userId,
          role,
          status,
          {
            source: defaultData.source ?? oldRole.source,
            inviterId: defaultData.inviterId ?? oldRole.inviterId ?? undefined,
          }
        );
      }
      const newRole = await this.mustGet(workspaceId, userId);

      if (oldRole.status === WorkspaceMemberStatus.Accepted) {
        this.event.emit('workspace.members.roleChanged', {
          userId,
          workspaceId,
          role: newRole.type,
        });
      }

      return newRole;
    } else {
      const {
        status = WorkspaceMemberStatus.Pending,
        source = WorkspaceMemberSource.Email,
        inviterId,
      } = defaultData;

      if (status === WorkspaceMemberStatus.Accepted) {
        await this.models.workspaceMember.setActive(workspaceId, userId, role);
      } else {
        await this.models.workspaceInvitation.set(
          workspaceId,
          userId,
          role,
          status,
          {
            source,
            inviterId,
          }
        );
      }
      return await this.mustGet(workspaceId, userId);
    }
  }

  private async setExternal(
    workspaceId: string,
    userId: string,
    oldRole: WorkspaceUserRole | null
  ) {
    await this.models.permissionProjection.markLegacyWriteOrigin();
    await this.db.workspaceMember.deleteMany({
      where: { workspaceId, userId, state: 'active' },
    });
    await this.db.workspaceInvitation.deleteMany({
      where: { workspaceId, inviteeUserId: userId },
    });

    await this.models.permissionProjection.markNewWriteOrigin();
    if (oldRole) {
      return await this.withPermissionProjectionMetric(
        this.db.workspaceUserRole.update({
          where: { id: oldRole.id },
          data: {
            type: WorkspaceRole.External,
            status: WorkspaceMemberStatus.Accepted,
          },
        })
      );
    }

    return await this.withPermissionProjectionMetric(
      this.db.workspaceUserRole.create({
        data: {
          workspaceId,
          userId,
          type: WorkspaceRole.External,
          status: WorkspaceMemberStatus.Accepted,
        },
      })
    );
  }

  async setStatus(
    workspaceId: string,
    userId: string,
    status: WorkspaceMemberStatus,
    data: {
      inviterId?: string;
    } = {}
  ) {
    const { inviterId } = data;
    await this.models.workspaceInvitation.setState(
      workspaceId,
      userId,
      status,
      {
        inviterId,
      }
    );
    return await this.mustGet(workspaceId, userId);
  }

  private async mustGet(workspaceId: string, userId: string) {
    const role = await this.get(workspaceId, userId);
    if (!role) {
      throw new Error(
        `Workspace permission ${workspaceId}/${userId} not found after write.`
      );
    }
    return role;
  }

  @Transactional()
  async delete(workspaceId: string, userId: string) {
    await this.models.workspaceMember.delete(workspaceId, userId);
    await this.db.workspaceInvitation.deleteMany({
      where: { workspaceId, inviteeUserId: userId },
    });
    await this.withPermissionProjectionMetric(
      this.db.workspaceUserRole.deleteMany({
        where: {
          workspaceId,
          userId,
        },
      })
    );
  }

  @Transactional()
  async deleteByUserId(userId: string) {
    await this.models.permissionProjection.markNewWriteOrigin();
    await this.db.workspaceMember.deleteMany({
      where: { userId },
    });
    await this.db.workspaceInvitation.deleteMany({
      where: { inviteeUserId: userId },
    });
    await this.withPermissionProjectionMetric(
      this.db.workspaceUserRole.deleteMany({
        where: {
          userId,
        },
      })
    );
  }

  async deleteNonAccepted(workspaceId: string) {
    return await this.models.workspaceInvitation.deleteNonAccepted(workspaceId);
  }

  @Transactional()
  async demoteAcceptedAdmins(workspaceId: string) {
    await this.models.permissionProjection.markNewWriteOrigin();
    return await this.db.workspaceMember.updateMany({
      where: { workspaceId, role: 'admin', state: 'active' },
      data: { role: 'member' },
    });
  }

  async get(workspaceId: string, userId: string) {
    const active = await this.db.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId,
        state: 'active',
      },
    });
    if (active) {
      return workspaceMemberToCompat(active);
    }

    const invitation = await this.db.workspaceInvitation.findUnique({
      where: {
        workspaceId_inviteeUserId: {
          workspaceId,
          inviteeUserId: userId,
        },
      },
    });
    if (invitation) {
      return workspaceInvitationToCompat(invitation);
    }

    return await this.db.workspaceUserRole.findFirst({
      where: {
        workspaceId,
        userId,
        type: WorkspaceRole.External,
      },
    });
  }

  async getById(id: string) {
    const member = await this.db.workspaceMember.findFirst({
      where: {
        OR: [{ id }, { legacyPermissionId: id }],
      },
    });
    if (member) {
      return workspaceMemberToCompat(member);
    }

    const invitation = await this.db.workspaceInvitation.findFirst({
      where: {
        OR: [{ id }, { legacyPermissionId: id }],
        inviteeUserId: {
          not: null,
        },
      },
    });
    if (invitation) {
      return workspaceInvitationToCompat(invitation);
    }

    return await this.db.workspaceUserRole.findUnique({
      where: { id },
    });
  }

  /**
   * Get the **accepted** Role of a user in a workspace.
   */
  async getActive(workspaceId: string, userId: string) {
    const active = await this.db.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId,
        state: 'active',
      },
    });
    return active ? workspaceMemberToCompat(active) : null;
  }

  async getOwner(workspaceId: string) {
    const role = await this.db.workspaceMember.findFirst({
      include: {
        user: {
          select: workspaceUserSelect,
        },
      },
      where: {
        workspaceId,
        role: 'owner',
        state: 'active',
      },
    });

    if (!role?.user) {
      throw new Error('Workspace owner not found');
    }

    return role.user;
  }

  async getAdmins(workspaceId: string) {
    const list = await this.db.workspaceMember.findMany({
      include: {
        user: {
          select: workspaceUserSelect,
        },
      },
      where: {
        workspaceId,
        role: 'admin',
        state: 'active',
      },
    });

    return list.map(l => l.user);
  }

  async count(workspaceId: string) {
    return await countWorkspaceUsers(this.db, workspaceId);
  }

  /**
   * Get the number of users those in the status should be charged in billing system in a workspace.
   */
  async chargedCount(workspaceId: string) {
    return await countChargedWorkspaceUsers(this.db, workspaceId);
  }

  async getUserActiveRoles(
    userId: string,
    filter: { role?: WorkspaceRole } = {}
  ) {
    return await findUserActiveWorkspaceRoles(this.db, userId, filter);
  }

  async getUserWorkspaceIds(userId: string) {
    const [roles, invitations] = await Promise.all([
      this.db.workspaceMember.findMany({
        where: { userId, state: 'active' },
        select: { workspaceId: true },
      }),
      this.db.workspaceInvitation.findMany({
        where: { inviteeUserId: userId },
        select: { workspaceId: true },
      }),
    ]);

    return Array.from(
      new Set([
        ...roles.map(role => role.workspaceId),
        ...invitations.map(invitation => invitation.workspaceId),
      ])
    );
  }

  async hasSharedWorkspace(userId: string, otherUserId: string) {
    return await hasSharedWorkspace(this.db, userId, otherUserId);
  }

  async paginate(workspaceId: string, pagination: PaginationInput) {
    const rows = await queryCompatRows(this.db, workspaceId, {
      first: pagination.first,
      offset: pagination.offset + (pagination.after ? 1 : 0),
      after: pagination.after ?? undefined,
    });
    return [rows, await this.count(workspaceId)] as const;
  }

  async search(
    workspaceId: string,
    query: string,
    pagination: PaginationInput
  ) {
    return await searchCompatRows(this.db, workspaceId, query, {
      first: pagination.first,
      offset: pagination.offset + (pagination.after ? 1 : 0),
      after: pagination.after ?? undefined,
    });
  }

  async adminListMembers(
    workspaceId: string,
    options: {
      first: number;
      offset: number;
      query?: string | null;
    }
  ): Promise<AdminWorkspaceMember[]> {
    const keyword = options.query?.trim();
    const keywordCondition = keyword
      ? Prisma.sql`AND (u.name ILIKE ${`%${keyword}%`} OR u.email ILIKE ${`%${keyword}%`})`
      : Prisma.empty;

    return await this.db.$queryRaw<AdminWorkspaceMember[]>`
      SELECT *
      FROM (
        SELECT
          u.id,
          u.name,
          u.email,
          u.avatar_url AS "avatarUrl",
          CASE wm.role
            WHEN 'owner' THEN 'Owner'
            WHEN 'admin' THEN 'Admin'
            ELSE 'Collaborator'
          END AS role,
          'Accepted'::"WorkspaceMemberStatus" AS status,
          wm.created_at AS created_at
        FROM workspace_members wm
        INNER JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = ${workspaceId}
          AND wm.state = 'active'
          ${keywordCondition}
        UNION ALL
        SELECT
          u.id,
          u.name,
          u.email,
          u.avatar_url AS "avatarUrl",
          CASE wi.requested_role
            WHEN 'admin' THEN 'Admin'
            ELSE 'Collaborator'
          END AS role,
          CASE wi.status
            WHEN 'waiting_review' THEN 'UnderReview'::"WorkspaceMemberStatus"
            WHEN 'waiting_seat' THEN 'NeedMoreSeat'::"WorkspaceMemberStatus"
            ELSE 'Pending'::"WorkspaceMemberStatus"
          END AS status,
          wi.created_at AS created_at
        FROM workspace_invitations wi
        INNER JOIN users u ON u.id = wi.invitee_user_id
        WHERE wi.workspace_id = ${workspaceId}
          ${keywordCondition}
      ) members
      ORDER BY created_at ASC, id ASC
      OFFSET ${options.offset}
      LIMIT ${options.first}
    `;
  }

  @Transactional()
  async allocateSeats(workspaceId: string, limit: number) {
    return await allocateWorkspaceSeats(
      this.db,
      this.models,
      workspaceId,
      limit
    );
  }
}
