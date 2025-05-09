import { Injectable } from '@nestjs/common';

import { Mutex } from '../../../base';
import { Models } from '../../../models';
import { DocStorageOptions } from '../options';
import { DocRecord, DocStorageAdapter } from '../storage';

@Injectable()
export class PgUserspaceDocStorageAdapter extends DocStorageAdapter {
  constructor(
    private readonly mutex: Mutex,
    private readonly models: Models,
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
    return await this.getDocSnapshot(spaceId, docId);
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
    await this.models.userDoc.delete(userId, docId);
  }

  async deleteSpace(userId: string) {
    await this.models.userDoc.deleteAllByUserId(userId);
  }

  async getSpaceDocTimestamps(userId: string, after?: number) {
    return await this.models.userDoc.findTimestampsByUserId(userId, after);
  }

  protected async getDocSnapshot(userId: string, docId: string) {
    const snapshot = await this.models.userDoc.get(userId, docId);

    if (!snapshot) {
      return null;
    }

    return {
      spaceId: snapshot.spaceId,
      docId: snapshot.docId,
      bin: snapshot.blob,
      timestamp: snapshot.timestamp,
      editor: snapshot.editorId,
    };
  }

  protected async setDocSnapshot(snapshot: DocRecord) {
    // we always get lock before writing to user snapshot table,
    // so a simple upsert without testing on updatedAt is safe
    await this.models.userDoc.upsert({
      ...snapshot,
      blob: Buffer.from(snapshot.bin),
    });

    return true;
  }

  protected override async lockDocForUpdate(spaceId: string, docId: string) {
    const lock = await this.mutex.acquire(`userspace:${spaceId}:${docId}`);

    if (!lock) {
      throw new Error('Too many concurrent writings');
    }

    return lock;
  }
}
