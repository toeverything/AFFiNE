import assert from 'node:assert';

import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { WorkspaceDocUserRole } from '@prisma/client';

import { CanNotBatchGrantDocOwnerPermissions, PaginationInput } from '../base';
import { BaseModel } from './base';
import { DocRole } from './common';

@Injectable()
export class DocUserModel extends BaseModel {
  /**
   * Set or update the [Owner] of a doc.
   * The old [Owner] will be changed to [Manager] if there is already an [Owner].
   */
  @Transactional()
  async setOwner(workspaceId: string, docId: string, userId: string) {
    const oldOwner = await this.db.workspaceDocUserRole.findFirst({
      where: {
        workspaceId,
        docId,
        type: DocRole.Owner,
      },
    });

    if (oldOwner) {
      await this.db.workspaceDocUserRole.update({
        where: {
          workspaceId_docId_userId: {
            workspaceId,
            docId,
            userId: oldOwner.userId,
          },
        },
        data: {
          type: DocRole.Manager,
        },
      });
    }

    await this.db.workspaceDocUserRole.upsert({
      where: {
        workspaceId_docId_userId: {
          workspaceId,
          docId,
          userId,
        },
      },
      update: {
        type: DocRole.Owner,
      },
      create: {
        workspaceId,
        docId,
        userId,
        type: DocRole.Owner,
      },
    });

    if (oldOwner) {
      this.logger.log(
        `Transfer doc owner of [${workspaceId}/${docId}] from [${oldOwner.userId}] to [${userId}]`
      );
    } else {
      this.logger.log(
        `Set doc owner of [${workspaceId}/${docId}] to [${userId}]`
      );
    }
  }

  /**
   * Set or update the Role of a user in a doc.
   *
   * NOTE: do not use this method to set the [Owner] of a doc. Use {@link setOwner} instead.
   */
  @Transactional()
  async set(workspaceId: string, docId: string, userId: string, role: DocRole) {
    // internal misuse, throw directly
    assert(role !== DocRole.Owner, 'Cannot set Owner role of a doc to a user.');

    const oldRole = await this.get(workspaceId, docId, userId);

    if (oldRole && oldRole.type === role) {
      return oldRole;
    }

    const newRole = await this.db.workspaceDocUserRole.upsert({
      where: {
        workspaceId_docId_userId: {
          workspaceId,
          docId,
          userId,
        },
      },
      update: {
        type: role,
      },
      create: {
        workspaceId,
        docId,
        userId,
        type: role,
      },
    });

    return newRole;
  }

  async batchSetUserRoles(
    workspaceId: string,
    docId: string,
    userIds: string[],
    role: DocRole
  ) {
    if (userIds.length === 0) {
      return 0;
    }

    if (role === DocRole.Owner) {
      throw new CanNotBatchGrantDocOwnerPermissions();
    }

    const result = await this.db.workspaceDocUserRole.createMany({
      skipDuplicates: true,
      data: userIds.map(userId => ({
        workspaceId,
        docId,
        userId,
        type: role,
      })),
    });

    return result.count;
  }

  async delete(workspaceId: string, docId: string, userId: string) {
    await this.db.workspaceDocUserRole.deleteMany({
      where: {
        workspaceId,
        docId,
        userId,
      },
    });
  }

  async deleteByUserId(userId: string) {
    await this.db.workspaceDocUserRole.deleteMany({
      where: {
        userId,
      },
    });
  }

  async getOwner(workspaceId: string, docId: string) {
    return await this.db.workspaceDocUserRole.findFirst({
      where: {
        workspaceId,
        docId,
        type: DocRole.Owner,
      },
    });
  }

  async get(workspaceId: string, docId: string, userId: string) {
    return await this.db.workspaceDocUserRole.findUnique({
      where: {
        workspaceId_docId_userId: {
          workspaceId,
          docId,
          userId,
        },
      },
    });
  }

  async findMany(workspaceId: string, docIds: string[], userId: string) {
    return await this.db.workspaceDocUserRole.findMany({
      where: {
        workspaceId,
        docId: {
          in: docIds,
        },
        userId,
      },
    });
  }

  count(workspaceId: string, docId: string) {
    return this.db.workspaceDocUserRole.count({
      where: {
        workspaceId,
        docId,
      },
    });
  }

  async paginate(
    workspaceId: string,
    docId: string,
    pagination: PaginationInput
  ): Promise<[WorkspaceDocUserRole[], number]> {
    return await Promise.all([
      this.db.workspaceDocUserRole.findMany({
        where: {
          workspaceId,
          docId,
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
      this.count(workspaceId, docId),
    ]);
  }
}
