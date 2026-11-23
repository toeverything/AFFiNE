import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { BlobInvalid } from '../base';
import { BaseModel } from './base';

/**
 * Blob Model
 */
@Injectable()
export class BlobModel extends BaseModel {
  async setReservationUploadId(
    workspaceId: string,
    key: string,
    reservationId: string,
    uploadId: string | null
  ) {
    const result = await this.db.blob.updateMany({
      where: { workspaceId, key, reservationId, status: 'pending' },
      data: { uploadId },
    });
    if (result.count !== 1) throw new BlobInvalid('Blob reservation changed');
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
        status: 'completed',
      },
    });
    return count > 0;
  }

  async totalSize(workspaceId: string) {
    const sum = await this.db.blob.aggregate({
      where: {
        workspaceId,
        deletedAt: null,
        status: 'completed',
      },
      _sum: {
        size: true,
      },
    });

    return sum._sum.size ?? 0;
  }
}
