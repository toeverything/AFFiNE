import {
  base64ToUint8Array,
  uint8ArrayToBase64,
} from '@affine/core/modules/workspace-engine';
import {
  type BlobRecord,
  type CrawlResult,
  type DocClock,
  type DocIndexedClock,
  type DocRecord,
  type ListedBlobRecord,
  parseUniversalId,
} from '@affine/nbstore';
import { type NativeDBApis } from '@affine/nbstore/sqlite';
import { registerPlugin } from '@capacitor/core';

import type { NbStorePlugin } from './definitions';

export * from './definitions';

export const NbStore = registerPlugin<NbStorePlugin>('NbStoreDocStorage');

export const NbStoreNativeDBApis: NativeDBApis = {
  connect: async function (id: string): Promise<void> {
    const { peer, type, id: spaceId } = parseUniversalId(id);
    return await NbStore.connect({ id, spaceId, spaceType: type, peer });
  },
  disconnect: function (id: string): Promise<void> {
    return NbStore.disconnect({ id });
  },
  pushUpdate: async function (
    id: string,
    docId: string,
    update: Uint8Array
  ): Promise<Date> {
    const { timestamp } = await NbStore.pushUpdate({
      id,
      docId,
      data: await uint8ArrayToBase64(update),
    });
    return new Date(timestamp);
  },
  getDocSnapshot: async function (
    id: string,
    docId: string
  ): Promise<DocRecord | null> {
    const snapshot = await NbStore.getDocSnapshot({ id, docId });
    return snapshot
      ? {
          bin: base64ToUint8Array(snapshot.bin),
          docId: snapshot.docId,
          timestamp: new Date(snapshot.timestamp),
        }
      : null;
  },
  setDocSnapshot: async function (
    id: string,
    snapshot: DocRecord
  ): Promise<boolean> {
    const { success } = await NbStore.setDocSnapshot({
      id,
      docId: snapshot.docId,
      bin: await uint8ArrayToBase64(snapshot.bin),
      timestamp: snapshot.timestamp.getTime(),
    });
    return success;
  },
  getDocUpdates: async function (
    id: string,
    docId: string
  ): Promise<DocRecord[]> {
    const { updates } = await NbStore.getDocUpdates({ id, docId });
    return updates.map(update => ({
      bin: base64ToUint8Array(update.bin),
      docId: update.docId,
      timestamp: new Date(update.timestamp),
    }));
  },
  markUpdatesMerged: async function (
    id: string,
    docId: string,
    updates: Date[]
  ): Promise<number> {
    const { count } = await NbStore.markUpdatesMerged({
      id,
      docId,
      timestamps: updates.map(t => t.getTime()),
    });
    return count;
  },
  deleteDoc: async function (id: string, docId: string): Promise<void> {
    await NbStore.deleteDoc({
      id,
      docId,
    });
  },
  getDocClocks: async function (
    id: string,
    after?: Date | undefined | null
  ): Promise<DocClock[]> {
    const clocks = (
      await NbStore.getDocClocks({
        id,
        after: after?.getTime(),
      })
    ).clocks;
    return clocks.map(c => ({
      docId: c.docId,
      timestamp: new Date(c.timestamp),
    }));
  },
  getDocClock: async function (
    id: string,
    docId: string
  ): Promise<DocClock | null> {
    const clock = await NbStore.getDocClock({
      id,
      docId,
    });
    return clock
      ? {
          timestamp: new Date(clock.timestamp),
          docId: clock.docId,
        }
      : null;
  },
  getBlob: async function (
    id: string,
    key: string
  ): Promise<BlobRecord | null> {
    const record = await NbStore.getBlob({
      id,
      key,
    });
    return record
      ? {
          data: base64ToUint8Array(record.data),
          key: record.key,
          mime: record.mime,
          createdAt: new Date(record.createdAt),
        }
      : null;
  },
  setBlob: async function (id: string, blob: BlobRecord): Promise<void> {
    await NbStore.setBlob({
      id,
      data: await uint8ArrayToBase64(blob.data),
      key: blob.key,
      mime: blob.mime,
    });
  },
  deleteBlob: async function (
    id: string,
    key: string,
    permanently: boolean
  ): Promise<void> {
    await NbStore.deleteBlob({
      id,
      key,
      permanently,
    });
  },
  releaseBlobs: async function (id: string): Promise<void> {
    await NbStore.releaseBlobs({
      id,
    });
  },
  listBlobs: async function (id: string): Promise<ListedBlobRecord[]> {
    const listed = await NbStore.listBlobs({
      id,
    });
    return listed.blobs.map(b => ({
      key: b.key,
      mime: b.mime,
      size: b.size,
      createdAt: new Date(b.createdAt),
    }));
  },
  getPeerRemoteClocks: async function (
    id: string,
    peer: string
  ): Promise<DocClock[]> {
    const clocks = (
      await NbStore.getPeerRemoteClocks({
        id,
        peer,
      })
    ).clocks;

    return clocks.map(c => ({
      docId: c.docId,
      timestamp: new Date(c.timestamp),
    }));
  },
  getPeerRemoteClock: async function (id: string, peer: string, docId: string) {
    const clock = await NbStore.getPeerRemoteClock({
      id,
      peer,
      docId,
    });
    return clock
      ? {
          docId: clock.docId,
          timestamp: new Date(clock.timestamp),
        }
      : null;
  },
  setPeerRemoteClock: async function (
    id: string,
    peer: string,
    docId: string,
    clock: Date
  ): Promise<void> {
    await NbStore.setPeerRemoteClock({
      id,
      peer,
      docId,
      timestamp: clock.getTime(),
    });
  },
  getPeerPulledRemoteClocks: async function (
    id: string,
    peer: string
  ): Promise<DocClock[]> {
    const clocks = (
      await NbStore.getPeerPulledRemoteClocks({
        id,
        peer,
      })
    ).clocks;
    return clocks.map(c => ({
      docId: c.docId,
      timestamp: new Date(c.timestamp),
    }));
  },
  getPeerPulledRemoteClock: async function (
    id: string,
    peer: string,
    docId: string
  ) {
    const clock = await NbStore.getPeerPulledRemoteClock({
      id,
      peer,
      docId,
    });
    return clock
      ? {
          docId: clock.docId,
          timestamp: new Date(clock.timestamp),
        }
      : null;
  },
  setPeerPulledRemoteClock: async function (
    id: string,
    peer: string,
    docId: string,
    clock: Date
  ): Promise<void> {
    await NbStore.setPeerPulledRemoteClock({
      id,
      peer,
      docId,
      timestamp: clock.getTime(),
    });
  },
  getPeerPushedClocks: async function (
    id: string,
    peer: string
  ): Promise<DocClock[]> {
    const clocks = (
      await NbStore.getPeerPushedClocks({
        id,
        peer,
      })
    ).clocks;
    return clocks.map(c => ({
      docId: c.docId,
      timestamp: new Date(c.timestamp),
    }));
  },
  getPeerPushedClock: async function (
    id: string,
    peer: string,
    docId: string
  ): Promise<DocClock | null> {
    const clock = await NbStore.getPeerPushedClock({
      id,
      peer,
      docId,
    });
    return clock
      ? {
          docId: clock.docId,
          timestamp: new Date(clock.timestamp),
        }
      : null;
  },
  setPeerPushedClock: async function (
    id: string,
    peer: string,
    docId: string,
    clock: Date
  ): Promise<void> {
    await NbStore.setPeerPushedClock({
      id,
      peer,
      docId,
      timestamp: clock.getTime(),
    });
  },
  clearClocks: async function (id: string): Promise<void> {
    await NbStore.clearClocks({
      id,
    });
  },
  getBlobUploadedAt: async function (
    id: string,
    peer: string,
    blobId: string
  ): Promise<Date | null> {
    const result = await NbStore.getBlobUploadedAt({
      id,
      peer,
      blobId,
    });
    return result.uploadedAt ? new Date(result.uploadedAt) : null;
  },
  setBlobUploadedAt: async function (
    id: string,
    peer: string,
    blobId: string,
    uploadedAt: Date | null
  ): Promise<void> {
    await NbStore.setBlobUploadedAt({
      id,
      peer,
      blobId,
      uploadedAt: uploadedAt ? uploadedAt.getTime() : null,
    });
  },
  crawlDocData: async function (
    id: string,
    docId: string
  ): Promise<CrawlResult> {
    return await NbStore.crawlDocData({ id, docId });
  },
  ftsAddDocument: async function (
    id: string,
    indexName: string,
    docId: string,
    text: string,
    index: boolean
  ): Promise<void> {
    await NbStore.ftsAddDocument({
      id,
      indexName,
      docId,
      text,
      index,
    });
  },
  ftsDeleteDocument: async function (
    id: string,
    indexName: string,
    docId: string
  ): Promise<void> {
    await NbStore.ftsDeleteDocument({
      id,
      indexName,
      docId,
    });
  },
  ftsSearch: async function (
    id: string,
    indexName: string,
    query: string
  ): Promise<{ id: string; score: number; terms: Array<string> }[]> {
    const { results } = await NbStore.ftsSearch({
      id,
      indexName,
      query,
    });
    return results ?? [];
  },
  ftsGetDocument: async function (
    id: string,
    indexName: string,
    docId: string
  ): Promise<string | null> {
    const result = await NbStore.ftsGetDocument({
      id,
      indexName,
      docId,
    });
    return result.text;
  },
  ftsGetMatches: async function (
    id: string,
    indexName: string,
    docId: string,
    query: string
  ): Promise<{ start: number; end: number }[]> {
    const { matches } = await NbStore.ftsGetMatches({
      id,
      indexName,
      docId,
      query,
    });
    return matches ?? [];
  },
  ftsFlushIndex: async function (id: string): Promise<void> {
    await NbStore.ftsFlushIndex({
      id,
    });
  },
  ftsIndexVersion: function (): Promise<number> {
    return NbStore.ftsIndexVersion().then(res => res.indexVersion);
  },
  getDocIndexedClock: function (
    id: string,
    docId: string
  ): Promise<DocIndexedClock | null> {
    return NbStore.getDocIndexedClock({ id, docId });
  },
  setDocIndexedClock: function (
    id: string,
    docId: string,
    indexedClock: Date,
    indexerVersion: number
  ): Promise<void> {
    return NbStore.setDocIndexedClock({
      id,
      docId,
      indexedClock: indexedClock.getTime(),
      indexerVersion,
    });
  },
  clearDocIndexedClock: function (id: string, docId: string): Promise<void> {
    return NbStore.clearDocIndexedClock({
      id,
      docId,
    });
  },
};
