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
      },
      create: {
        workspaceId: blob.workspaceId,
        key: blob.key,
        mime: blob.mime,
        size: blob.size,
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

  async list(workspaceId: string) {
    return await this.db.blob.findMany({
      where: {
        workspaceId,
        deletedAt: null,
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
