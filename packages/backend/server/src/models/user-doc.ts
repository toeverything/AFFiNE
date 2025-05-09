import { Injectable } from '@nestjs/common';

import { BaseModel } from './base';
import { Doc } from './common';

/**
 * User Doc Model
 */
@Injectable()
export class UserDocModel extends BaseModel {
  async upsert(doc: Doc) {
    const row = await this.db.userSnapshot.upsert({
      where: {
        userId_id: {
          userId: doc.spaceId,
          id: doc.docId,
        },
      },
      update: {
        blob: doc.blob,
        updatedAt: new Date(doc.timestamp),
      },
      create: {
        userId: doc.spaceId,
        id: doc.docId,
        blob: doc.blob,
        createdAt: new Date(doc.timestamp),
        updatedAt: new Date(doc.timestamp),
      },
      select: {
        updatedAt: true,
      },
    });
    return row;
  }

  async get(userId: string, docId: string): Promise<Doc | null> {
    const row = await this.db.userSnapshot.findUnique({
      where: {
        userId_id: {
          userId,
          id: docId,
        },
      },
    });

    if (!row) {
      return null;
    }

    return {
      spaceId: row.userId,
      docId: row.id,
      blob: row.blob,
      timestamp: row.updatedAt.getTime(),
      editorId: row.userId,
    };
  }

  /**
   * Find the timestamps of user docs by userId.
   *
   * @param after Only return timestamps after this timestamp.
   */
  async findTimestampsByUserId(userId: string, after?: number) {
    const snapshots = await this.db.userSnapshot.findMany({
      select: {
        id: true,
        updatedAt: true,
      },
      where: {
        userId,
        ...(after
          ? {
              updatedAt: {
                gt: new Date(after),
              },
            }
          : {}),
      },
    });

    const result: Record<string, number> = {};

    snapshots.forEach(s => {
      result[s.id] = s.updatedAt.getTime();
    });
    return result;
  }

  /**
   * Delete a user doc by userId and docId.
   */
  async delete(userId: string, docId: string) {
    const { count } = await this.db.userSnapshot.deleteMany({
      where: {
        userId,
        id: docId,
      },
    });
    if (count > 0) {
      this.logger.log(`Deleted user ${userId} doc ${docId}`);
    }
  }

  /**
   * Delete all user docs by userId.
   */
  async deleteAllByUserId(userId: string) {
    const { count } = await this.db.userSnapshot.deleteMany({
      where: {
        userId,
      },
    });
    if (count > 0) {
      this.logger.log(`Deleted user ${userId} ${count} docs`);
    }
    return count;
  }
}
