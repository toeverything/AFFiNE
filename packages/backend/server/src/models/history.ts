import { Injectable } from '@nestjs/common';

import { BaseModel } from './base';
import { Doc, DocEditor, publicUserSelect } from './common';

export interface DocHistorySimple {
  timestamp: number;
  editor: DocEditor | null;
}

export interface DocHistory {
  blob: Uint8Array;
  timestamp: number;
  editor: DocEditor | null;
}

export interface DocHistoryFilter {
  /**
   * timestamp to filter histories before.
   */
  before?: number;
  /**
   * limit the number of histories to return.
   *
   * Default to `100`.
   */
  take?: number;
}

@Injectable()
export class HistoryModel extends BaseModel {
  /**
   * Create a doc history with a max age.
   */
  async create(snapshot: Doc, maxAge: number): Promise<DocHistorySimple> {
    const row = await this.db.snapshotHistory.create({
      select: {
        timestamp: true,
        createdByUser: { select: publicUserSelect },
      },
      data: {
        workspaceId: snapshot.spaceId,
        id: snapshot.docId,
        timestamp: new Date(snapshot.timestamp),
        blob: snapshot.blob,
        createdBy: snapshot.editorId,
        expiredAt: new Date(Date.now() + maxAge),
      },
    });
    this.logger.debug(
      `Created history ${row.timestamp} for ${snapshot.docId} in ${snapshot.spaceId}`
    );
    return {
      timestamp: row.timestamp.getTime(),
      editor: row.createdByUser,
    };
  }

  /**
   * Find doc history by workspaceId and docId.
   *
   * Only including timestamp, createdByUser
   */
  async findMany(
    workspaceId: string,
    docId: string,
    filter?: DocHistoryFilter
  ): Promise<DocHistorySimple[]> {
    const rows = await this.db.snapshotHistory.findMany({
      select: {
        timestamp: true,
        createdByUser: { select: publicUserSelect },
      },
      where: {
        workspaceId,
        id: docId,
        timestamp: {
          lt: filter?.before ? new Date(filter.before) : new Date(),
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: filter?.take ?? 100,
    });
    return rows.map(r => ({
      timestamp: r.timestamp.getTime(),
      editor: r.createdByUser,
    }));
  }

  /**
   * Get the history of a doc at a specific timestamp.
   *
   * Including blob and createdByUser
   */
  async get(
    workspaceId: string,
    docId: string,
    timestamp: number
  ): Promise<DocHistory | null> {
    const row = await this.db.snapshotHistory.findUnique({
      where: {
        workspaceId_id_timestamp: {
          workspaceId,
          id: docId,
          timestamp: new Date(timestamp),
        },
      },
      include: {
        createdByUser: { select: publicUserSelect },
      },
    });
    if (!row) {
      return null;
    }
    return {
      blob: row.blob,
      timestamp: row.timestamp.getTime(),
      editor: row.createdByUser,
    };
  }

  /**
   * Get the latest history of a doc.
   *
   * Only including timestamp, createdByUser
   */
  async getLatest(
    workspaceId: string,
    docId: string
  ): Promise<DocHistorySimple | null> {
    const row = await this.db.snapshotHistory.findFirst({
      where: {
        workspaceId,
        id: docId,
      },
      select: {
        timestamp: true,
        createdByUser: { select: publicUserSelect },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });
    if (!row) {
      return null;
    }
    return {
      timestamp: row.timestamp.getTime(),
      editor: row.createdByUser,
    };
  }

  /**
   * Clean expired histories.
   */
  async cleanExpired() {
    const { count } = await this.db.snapshotHistory.deleteMany({
      where: {
        expiredAt: {
          lte: new Date(),
        },
      },
    });
    if (count > 0) {
      this.logger.log(`Deleted ${count} expired histories`);
    }
    return count;
  }
}
