import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { WorkspaceMemberStatus } from '@prisma/client';
import { groupBy } from 'lodash-es';

import { EventBus, PaginationInput } from '../base';
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
    // below are business events, should be declare somewhere else
    'workspace.members.updated': {
      workspaceId: string;
      count: number;
    };
    'workspace.members.removed': {
      userId: string;
      workspaceId: string;
    };
    'workspace.members.leave': {
      workspaceId: string;
      user: {
        id: string;
        email: string;
      };
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
      await this.db.workspaceUserRole.update({
        where: {
          id: oldOwner.id,
        },
        data: {
          type: WorkspaceRole.Admin,
        },
      });
    }

    await this.db.workspaceUserRole.upsert({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      update: {
        type: WorkspaceRole.Owner,
      },
      create: {
        workspaceId,
        userId,
        type: WorkspaceRole.Owner,
        status: WorkspaceMemberStatus.Accepted,
      },
    });

    if (oldOwner) {
      this.event.emit('workspace.owner.changed', {
        workspaceId,
        from: oldOwner.userId,
        to: userId,
      });
      this.logger.log(
        `Transfer workspace owner of [${workspaceId}] from [${oldOwner.userId}] to [${userId}]`
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
    defaultStatus: WorkspaceMemberStatus = WorkspaceMemberStatus.Pending
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
      return await this.db.workspaceUserRole.create({
        data: {
          workspaceId,
          userId,
          type: role,
          status: defaultStatus,
        },
      });
    }
  }

  async setStatus(
    workspaceId: string,
    userId: string,
    status: WorkspaceMemberStatus
  ) {
    return await this.db.workspaceUserRole.update({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      data: {
        status,
      },
    });
  }

  async accept(id: string) {
    await this.db.workspaceUserRole.update({
      where: { id },
      data: { status: WorkspaceMemberStatus.Accepted },
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
              },
            },
            {
              name: {
                contains: query,
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
  async refresh(workspaceId: string, memberLimit: number) {
    const usedCount = await this.db.workspaceUserRole.count({
      where: { workspaceId, status: WorkspaceMemberStatus.Accepted },
    });

    const availableCount = memberLimit - usedCount;

    if (availableCount <= 0) {
      return;
    }

    const members = await this.db.workspaceUserRole.findMany({
      select: { id: true, status: true },
      where: {
        workspaceId,
        status: {
          in: [
            WorkspaceMemberStatus.NeedMoreSeat,
            WorkspaceMemberStatus.NeedMoreSeatAndReview,
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const needChange = members.slice(0, availableCount);
    const { NeedMoreSeat, NeedMoreSeatAndReview } = groupBy(
      needChange,
      m => m.status
    );

    const toPendings = NeedMoreSeat ?? [];
    if (toPendings.length > 0) {
      await this.db.workspaceUserRole.updateMany({
        where: { id: { in: toPendings.map(m => m.id) } },
        data: { status: WorkspaceMemberStatus.Pending },
      });
    }

    const toUnderReviewUserIds = NeedMoreSeatAndReview ?? [];
    if (toUnderReviewUserIds.length > 0) {
      await this.db.workspaceUserRole.updateMany({
        where: { id: { in: toUnderReviewUserIds.map(m => m.id) } },
        data: { status: WorkspaceMemberStatus.UnderReview },
      });
    }
  }
}
