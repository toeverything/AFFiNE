import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import {
  WorkspaceMemberSource,
  WorkspaceMemberStatus,
  WorkspaceUserRole,
} from '@prisma/client';
import { groupBy } from 'lodash-es';

import { EventBus, NewOwnerIsNotActiveMember, PaginationInput } from '../base';
import { BaseModel } from './base';
import { WorkspaceRole, workspaceUserSelect } from './common';

export { WorkspaceMemberStatus };

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
   * The old [Owner] will be changed to [Admin] if there is already an [Owner].
   */
  @Transactional()
  async setOwner(workspaceId: string, userId: string) {
    const oldOwner = await this.db.workspaceUserRole.findFirst({
      where: {
        workspaceId,
        type: WorkspaceRole.Owner,
      },
    });

    // If there is already an owner, we need to change the old owner to admin
    if (oldOwner) {
      const newOwnerOldRole = await this.db.workspaceUserRole.findFirst({
        where: {
          workspaceId,
          userId,
        },
      });

      if (
        !newOwnerOldRole ||
        newOwnerOldRole.status !== WorkspaceMemberStatus.Accepted
      ) {
        throw new NewOwnerIsNotActiveMember();
      }

      await this.db.workspaceUserRole.update({
        where: {
          id: oldOwner.id,
        },
        data: {
          type: WorkspaceRole.Admin,
        },
      });
      await this.db.workspaceUserRole.update({
        where: {
          id: newOwnerOldRole.id,
        },
        data: {
          type: WorkspaceRole.Owner,
        },
      });
      this.event.emit('workspace.owner.changed', {
        workspaceId,
        from: oldOwner.userId,
        to: userId,
      });
      this.logger.log(
        `Transfer workspace owner of [${workspaceId}] from [${oldOwner.userId}] to [${userId}]`
      );
    } else {
      await this.db.workspaceUserRole.create({
        data: {
          workspaceId,
          userId,
          type: WorkspaceRole.Owner,
          status: WorkspaceMemberStatus.Accepted,
        },
      });
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
    if (role === WorkspaceRole.Owner) {
      throw new Error('Cannot grant Owner role of a workspace to a user.');
    }

    const oldRole = await this.get(workspaceId, userId);

    if (oldRole) {
      if (oldRole.type === role) {
        return oldRole;
      }

      const newRole = await this.db.workspaceUserRole.update({
        where: { id: oldRole.id },
        data: { type: role },
      });

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

      return await this.db.workspaceUserRole.create({
        data: {
          workspaceId,
          userId,
          type: role,
          status,
          source,
          inviterId,
        },
      });
    }
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
    return await this.db.workspaceUserRole.update({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      data: {
        status,
        inviterId,
      },
    });
  }

  async delete(workspaceId: string, userId: string) {
    await this.db.workspaceUserRole.deleteMany({
      where: {
        workspaceId,
        userId,
      },
    });
  }

  async deleteByUserId(userId: string) {
    await this.db.workspaceUserRole.deleteMany({
      where: {
        userId,
      },
    });
  }

  async get(workspaceId: string, userId: string) {
    return await this.db.workspaceUserRole.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });
  }

  async getById(id: string) {
    return await this.db.workspaceUserRole.findUnique({
      where: { id },
    });
  }

  /**
   * Get the **accepted** Role of a user in a workspace.
   */
  async getActive(workspaceId: string, userId: string) {
    return await this.db.workspaceUserRole.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId },
        status: WorkspaceMemberStatus.Accepted,
      },
    });
  }

  async getOwner(workspaceId: string) {
    const role = await this.db.workspaceUserRole.findFirst({
      include: {
        user: {
          select: workspaceUserSelect,
        },
      },
      where: {
        workspaceId,
        type: WorkspaceRole.Owner,
      },
    });

    if (!role) {
      throw new Error('Workspace owner not found');
    }

    return role.user;
  }

  async getAdmins(workspaceId: string) {
    const list = await this.db.workspaceUserRole.findMany({
      include: {
        user: {
          select: workspaceUserSelect,
        },
      },
      where: {
        workspaceId,
        type: WorkspaceRole.Admin,
        status: WorkspaceMemberStatus.Accepted,
      },
    });

    return list.map(l => l.user);
  }

  async count(workspaceId: string) {
    return this.db.workspaceUserRole.count({
      where: {
        workspaceId,
      },
    });
  }

  /**
   * Get the number of users those in the status should be charged in billing system in a workspace.
   */
  async chargedCount(workspaceId: string) {
    return this.db.workspaceUserRole.count({
      where: {
        workspaceId,
        status: {
          not: WorkspaceMemberStatus.UnderReview,
        },
      },
    });
  }

  async getUserActiveRoles(
    userId: string,
    filter: { role?: WorkspaceRole } = {}
  ) {
    return await this.db.workspaceUserRole.findMany({
      where: {
        userId,
        status: WorkspaceMemberStatus.Accepted,
        type: filter.role,
      },
    });
  }

  async paginate(workspaceId: string, pagination: PaginationInput) {
    return await Promise.all([
      this.db.workspaceUserRole.findMany({
        include: {
          user: {
            select: workspaceUserSelect,
          },
        },
        where: {
          workspaceId,
          createdAt: pagination.after
            ? {
                gte: pagination.after,
              }
            : undefined,
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: pagination.first,
        skip: pagination.offset + (pagination.after ? 1 : 0),
      }),
      this.count(workspaceId),
    ]);
  }

  async search(
    workspaceId: string,
    query: string,
    pagination: PaginationInput
  ) {
    return await this.db.workspaceUserRole.findMany({
      include: { user: { select: workspaceUserSelect } },
      where: {
        workspaceId,
        status: WorkspaceMemberStatus.Accepted,
        user: {
          OR: [
            {
              email: {
                contains: query,
                mode: 'insensitive',
              },
            },
            {
              name: {
                contains: query,
                mode: 'insensitive',
              },
            },
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
      take: pagination.first,
      skip: pagination.offset + (pagination.after ? 1 : 0),
    });
  }

  @Transactional()
  async allocateSeats(workspaceId: string, limit: number) {
    const usedCount = await this.db.workspaceUserRole.count({
      where: {
        workspaceId,
        status: {
          in: [WorkspaceMemberStatus.Accepted, WorkspaceMemberStatus.Pending],
        },
      },
    });

    if (limit <= usedCount) {
      return [];
    }

    const membersToBeAllocated = await this.db.workspaceUserRole.findMany({
      where: {
        workspaceId,
        status: {
          in: [
            WorkspaceMemberStatus.AllocatingSeat,
            WorkspaceMemberStatus.NeedMoreSeat,
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit - usedCount,
    });

    const groups = groupBy(
      membersToBeAllocated,
      member => member.source
    ) as Record<WorkspaceMemberSource, WorkspaceUserRole[]>;

    if (groups.Email?.length > 0) {
      await this.db.workspaceUserRole.updateMany({
        where: { id: { in: groups.Email.map(m => m.id) } },
        data: { status: WorkspaceMemberStatus.Pending },
      });
    }

    if (groups.Link?.length > 0) {
      await this.db.workspaceUserRole.updateMany({
        where: { id: { in: groups.Link.map(m => m.id) } },
        data: { status: WorkspaceMemberStatus.Accepted },
      });
    }

    // after allocating, all rests should be `NeedMoreSeat`
    await this.db.workspaceUserRole.updateMany({
      where: {
        workspaceId,
        status: WorkspaceMemberStatus.AllocatingSeat,
      },
      data: { status: WorkspaceMemberStatus.NeedMoreSeat },
    });

    return groups.Email ?? [];
  }
}
