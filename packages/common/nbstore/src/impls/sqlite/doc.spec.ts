import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  applyUpdate,
  Doc as YDoc,
  encodeStateAsUpdate,
  encodeStateVector,
} from 'yjs';

import type { DocDiff, DocRecord } from '../../storage';
import { bindNativeDBApis, type NativeDBApis } from './db';
import { SqliteDocStorage } from './doc';

function createBaseApis(overrides: Partial<NativeDBApis> = {}): NativeDBApis {
  const unimplemented = async () => {
    throw new Error('not implemented in test');
  };
  return {
    connect: async () => {},
    disconnect: async () => {},
    pushUpdate: unimplemented,
    getPeerWorkspaceState: unimplemented,
    invalidatePeerWorkspaceState: unimplemented,
    installPeerWorkspaceState: unimplemented,
    confirmPeerDocCreate: unimplemented,
    getDoc: async () => null,
    deleteDoc: unimplemented,
    getDocClocks: unimplemented,
    getDocClock: unimplemented,
    getDocIndexedClock: unimplemented,
    setDocIndexedClock: unimplemented,
    setDocIndexedClocks: unimplemented,
    clearDocIndexedClock: unimplemented,
    getBlob: unimplemented,
    setBlob: unimplemented,
    deleteBlob: unimplemented,
    releaseBlobs: unimplemented,
    listBlobs: unimplemented,
    getPeerRemoteClocks: unimplemented,
    getPeerRemoteClock: unimplemented,
    setPeerRemoteClock: unimplemented,
    getPeerPulledRemoteClocks: unimplemented,
    getPeerPulledRemoteClock: unimplemented,
    setPeerPulledRemoteClock: unimplemented,
    getPeerPushedClocks: unimplemented,
    getPeerPushedClock: unimplemented,
    setPeerPushedClock: unimplemented,
    clearClocks: unimplemented,
    setBlobUploadedAt: unimplemented,
    getBlobUploadedAt: unimplemented,
    crawlDocData: unimplemented,
    indexUpsert: unimplemented,
    indexDelete: unimplemented,
    indexSearch: unimplemented,
    indexAggregate: unimplemented,
    indexDeleteByQuery: unimplemented,
    indexFlush: unimplemented,
    indexVersion: unimplemented,
    ...overrides,
  };
}

describe('SqliteDocStorage.getDocDiff', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('delegates directly to native getDocDiff when implemented', async () => {
    const doc = new YDoc();
    doc.getText('content').insert(0, 'hello');
    const sv1 = encodeStateVector(doc);
    doc.getText('content').insert(5, ' world');
    const fullUpdate = encodeStateAsUpdate(doc);
    const fullSv = encodeStateVector(doc);
    const diffUpdate = encodeStateAsUpdate(doc, sv1);
    const ts = new Date('2026-01-01T00:00:00.000Z');

    const getDoc = vi.fn(async () => {
      throw new Error(
        'getDoc should not be called when native getDocDiff is present'
      );
    });
    const getDocDiff = vi.fn(
      async (
        _id: string,
        docId: string,
        state?: Uint8Array
      ): Promise<DocDiff | null> => {
        if (docId === 'missing') return null;
        if (!state || state.length === 0) {
          return { docId, missing: fullUpdate, state: fullSv, timestamp: ts };
        }
        return { docId, missing: diffUpdate, state: fullSv, timestamp: ts };
      }
    );

    bindNativeDBApis(createBaseApis({ getDoc, getDocDiff }));

    const storage = new SqliteDocStorage({
      flavour: 'local',
      type: 'workspace',
      id: 'ws-native-diff',
    });

    expect(await storage.getDocDiff('missing')).toBeNull();

    const full1 = await storage.getDocDiff('doc-1');
    expect(full1).toEqual({
      docId: 'doc-1',
      missing: fullUpdate,
      state: fullSv,
      timestamp: ts,
    });

    const full2 = await storage.getDocDiff('doc-1', new Uint8Array(0));
    expect(full2?.missing).toEqual(fullUpdate);

    const inc = await storage.getDocDiff('doc-1', sv1);
    expect(inc?.missing).toEqual(diffUpdate);
    expect(inc?.state).toEqual(fullSv);

    expect(getDoc).not.toHaveBeenCalled();
    expect(getDocDiff).toHaveBeenCalledTimes(4);
  });

  test('falls back to DocStorageBase.getDocDiff when native getDocDiff is omitted', async () => {
    const doc = new YDoc();
    doc.getText('content').insert(0, 'alpha');
    const sv1 = encodeStateVector(doc);
    doc.getText('content').insert(5, ' beta');
    const fullUpdate = encodeStateAsUpdate(doc);
    const ts = new Date('2026-01-02T00:00:00.000Z');

    const getDoc = vi.fn(
      async (_id: string, docId: string): Promise<DocRecord | null> => {
        if (docId !== 'doc-fallback') return null;
        return { docId, bin: fullUpdate, timestamp: ts };
      }
    );

    bindNativeDBApis(createBaseApis({ getDoc }));

    const storage = new SqliteDocStorage({
      flavour: 'local',
      type: 'workspace',
      id: 'ws-fallback-diff',
    });

    expect(await storage.getDocDiff('missing')).toBeNull();

    const zeroDiff = await storage.getDocDiff(
      'doc-fallback',
      new Uint8Array([0])
    );
    expect(zeroDiff).not.toBeNull();
    const restoredZero = new YDoc();
    applyUpdate(restoredZero, zeroDiff!.missing);
    expect(restoredZero.getText('content').toString()).toBe('alpha beta');

    const inc = await storage.getDocDiff('doc-fallback', sv1);
    expect(inc).not.toBeNull();
    expect(inc!.timestamp).toEqual(ts);
    expect(getDoc).toHaveBeenCalledTimes(3);
  });
});
