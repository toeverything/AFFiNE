import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { Mutex } from '../../../fundamentals';
import { DocStorageOptions } from '../options';
import { DocRecord, DocStorageAdapter } from '../storage';

@Injectable()
export class PgUserspaceDocStorageAdapter extends DocStorageAdapter {
  constructor(
    private readonly db: PrismaClient,
    private readonly mutex: Mutex,
    options: DocStorageOptions
  ) {
    super(options);
  }

  // no updates queue for userspace, directly merge them inplace
  // no history record for userspace
  protected async getDocUpdates() {
    return [];
  }

  protected async markUpdatesMerged() {
    return 0;
  }

  async listDocHistories() {
    return [];
  }

  async getDocHistory() {
    return null;
  }

  protected async createDocHistory() {
    return false;
  }

  override async rollbackDoc() {
    return;
  }

  override async getDoc(spaceId: string, docId: string) {
    return this.getDocSnapshot(spaceId, docId);
  }

  async pushDocUpdates(
    userId: string,
    docId: string,
    updates: Uint8Array[],
    editorId?: string
  ) {
    if (!updates.length) {
      return 0;
    }

    await using _lock = await this.lockDocForUpdate(userId, docId);
    const snapshot = await this.getDocSnapshot(userId, docId);
    const now = Date.now();
    const pendings = updates.map((update, i) => ({
      bin: update,
      timestamp: now + i,
    }));

    const { timestamp, bin } = await this.squash(
      snapshot ? [snapshot, ...pendings] : pendings
    );

    await this.setDocSnapshot({
      spaceId: userId,
      docId,
      bin,
      timestamp,
      editor: editorId,
    });

    return timestamp;
  }

  async deleteDoc(userId: string, docId: string) {
    await this.db.userSnapshot.deleteMany({
      where: {
        userId,
        id: docId,
      },
    });
  }

  async deleteSpace(userId: string) {
    await this.db.userSnapshot.deleteMany({
      where: {
        userId,
      },
    });
  }

  async getSpaceDocTimestamps(userId: string, after?: number) {
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

  protected async getDocSnapshot(userId: string, docId: string) {
    const snapshot = await this.db.userSnapshot.findUnique({
      where: {
        userId_id: {
          userId,
          id: docId,
        },
      },
    });

    if (!snapshot) {
      return null;
    }

    return {
      spaceId: userId,
      docId,
      bin: snapshot.blob,
      timestamp: snapshot.updatedAt.getTime(),
      editor: snapshot.userId,
    };
  }

  protected async setDocSnapshot(snapshot: DocRecord) {
    // we always get lock before writing to user snapshot table,
    // so a simple upsert without testing on updatedAt is safe
    await this.db.userSnapshot.upsert({
      where: {
        userId_id: {
          userId: snapshot.spaceId,
          id: snapshot.docId,
        },
      },
      update: {
        blob: Buffer.from(snapshot.bin),
        updatedAt: new Date(snapshot.timestamp),
      },
      create: {
        userId: snapshot.spaceId,
        id: snapshot.docId,
        blob: Buffer.from(snapshot.bin),
        createdAt: new Date(snapshot.timestamp),
        updatedAt: new Date(snapshot.timestamp),
      },
    });

    return true;
  }

  protected override async lockDocForUpdate(
    workspaceId: string,
    docId: string
  ) {
    const lock = await this.mutex.lock(`userspace:${workspaceId}:${docId}`);

    if (!lock) {
      throw new Error('Too many concurrent writings');
    }

    return lock;
  }
}
