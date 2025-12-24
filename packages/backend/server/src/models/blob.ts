import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { BaseModel } from './base';

export type CreateBlobInput = Prisma.BlobUncheckedCreateInput;

/**
 * Blob Model
 */
@Injectable()
export class BlobModel extends BaseModel {
  async upsert(blob: CreateBlobInput) {
    return await this.db.blob.upsert({
      where: {
        workspaceId_key: {
          workspaceId: blob.workspaceId,
          key: blob.key,
        },
      },
      update: {
        mime: blob.mime,
        size: blob.size,
        status: blob.status,
        uploadId: blob.uploadId,
      },
      create: {
        workspaceId: blob.workspaceId,
        key: blob.key,
        mime: blob.mime,
        size: blob.size,
        status: blob.status,
        uploadId: blob.uploadId,
      },
    });
  }

  async delete(workspaceId: string, key: string, permanently = false) {
    if (permanently) {
      await this.db.blob.deleteMany({
        where: {
          workspaceId,
          key,
        },
      });
      this.logger.log(`deleted blob ${workspaceId}/${key} permanently`);
      return;
    }

    await this.db.blob.update({
      where: {
        workspaceId_key: {
          workspaceId,
          key,
        },
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async get(workspaceId: string, key: string) {
    return await this.db.blob.findUnique({
      where: {
        workspaceId_key: {
          workspaceId,
          key,
        },
      },
    });
  }

  async list(
    workspaceId: string,
    options?: { where: Prisma.BlobWhereInput; select?: Prisma.BlobSelect }
  ) {
    return await this.db.blob.findMany({
      where: {
        ...options?.where,
        workspaceId,
        deletedAt: null,
        status: 'completed',
      },
      select: options?.select,
    });
  }

  async hasAny(workspaceId: string) {
    const count = await this.db.blob.count({
      where: {
        workspaceId,
        deletedAt: null,
      },
    });
    return count > 0;
  }

  async listPendingExpired(before: Date) {
    return await this.db.blob.findMany({
      where: {
        status: 'pending',
        deletedAt: null,
        createdAt: {
          lt: before,
        },
      },
      select: {
        workspaceId: true,
        key: true,
        uploadId: true,
      },
    });
  }

  async listDeleted(workspaceId: string) {
    return await this.db.blob.findMany({
      where: {
        workspaceId,
        deletedAt: { not: null },
      },
    });
  }

  async totalSize(workspaceId: string) {
    const sum = await this.db.blob.aggregate({
      where: {
        workspaceId,
        deletedAt: null,
      },
      _sum: {
        size: true,
      },
    });

    return sum._sum.size ?? 0;
  }
}
