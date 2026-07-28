import assert from 'node:assert';

import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { DocGrant } from '@prisma/client';

import { CanNotBatchGrantDocOwnerPermissions, PaginationInput } from '../base';
import { BaseModel } from './base';
import { DocRole } from './common';
import { docRoleFromNew } from './permission-write';

declare global {
  interface Events {
    'doc.grants.changed': {
      workspaceId: string;
      docId: string;
    };
    'doc.owner.changed': {
      workspaceId: string;
      docId: string;
      userId: string;
    };
  }
}

@Injectable()
export class DocUserModel extends BaseModel {
  /**
   * Set or update the [Owner] of a doc.
   * The old [Owner] will be changed to [Manager] if there is already an [Owner].
   */
  @Transactional<TransactionalAdapterPrisma>({ timeout: 15000 })
  async setOwner(workspaceId: string, docId: string, userId: string) {
    await this.models.docGrant.setOwner(workspaceId, docId, userId);
    this.logger.log(
      `Set doc owner of [${workspaceId}/${docId}] to [${userId}]`
    );
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

    await this.models.docGrant.set(workspaceId, docId, userId, role);
    return await this.get(workspaceId, docId, userId);
  }

  @Transactional()
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

    return await this.models.docGrant.batchSetUserRoles(
      workspaceId,
      docId,
      userIds,
      role
    );
  }

  @Transactional()
  async delete(workspaceId: string, docId: string, userId: string) {
    await this.models.docGrant.delete(workspaceId, docId, userId);
  }

  @Transactional()
  async deleteByUserId(userId: string) {
    await this.db.docGrant.deleteMany({
      where: {
        principalType: 'user',
        principalId: userId,
      },
    });
  }

  async getOwner(workspaceId: string, docId: string) {
    const grant = await this.db.docGrant.findFirst({
      where: {
        workspaceId,
        docId,
        principalType: 'user',
        role: 'owner',
      },
    });
    return grant ? this.docGrantToCompat(grant) : null;
  }

  async get(workspaceId: string, docId: string, userId: string) {
    const grant = await this.db.docGrant.findUnique({
      where: {
        workspaceId_docId_principalType_principalId: {
          workspaceId,
          docId,
          principalType: 'user',
          principalId: userId,
        },
      },
    });
    return grant ? this.docGrantToCompat(grant) : null;
  }

  async findMany(workspaceId: string, docIds: string[], userId: string) {
    const grants = await this.db.docGrant.findMany({
      where: {
        workspaceId,
        docId: {
          in: docIds,
        },
        principalType: 'user',
        principalId: userId,
      },
    });
    return grants.map(grant => this.docGrantToCompat(grant));
  }

  async findDirectGrantDocIdsByUser(userId: string) {
    return await this.db.docGrant.findMany({
      where: { principalType: 'user', principalId: userId },
      select: { workspaceId: true, docId: true },
      distinct: ['workspaceId', 'docId'],
    });
  }

  count(workspaceId: string, docId: string) {
    return this.db.docGrant.count({
      where: {
        workspaceId,
        docId,
        principalType: 'user',
      },
    });
  }

  async paginate(
    workspaceId: string,
    docId: string,
    pagination: PaginationInput
  ): Promise<[DocUserCompat[], number]> {
    const [grants, total] = await Promise.all([
      this.db.docGrant.findMany({
        where: {
          workspaceId,
          docId,
          principalType: 'user',
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
    return [grants.map(grant => this.docGrantToCompat(grant)), total];
  }

  private docGrantToCompat(grant: DocGrant): DocUserCompat {
    return {
      workspaceId: grant.workspaceId,
      docId: grant.docId,
      userId: grant.principalId,
      type: docRoleFromNew(grant.role as never),
      createdAt: grant.createdAt,
    };
  }
}

type DocUserCompat = {
  workspaceId: string;
  docId: string;
  userId: string;
  type: DocRole;
  createdAt: Date;
};
