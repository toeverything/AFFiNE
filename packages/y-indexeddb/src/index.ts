import { openDB } from 'idb';
import {
  applyUpdate,
  diffUpdate,
  Doc,
  encodeStateAsUpdate,
  encodeStateVector,
  UndoManager,
} from 'yjs';

import type {
  BlockSuiteBinaryDB,
  IndexedDBProvider,
  WorkspaceMilestone,
} from './shared';
import { dbVersion, DEFAULT_DB_NAME, upgradeDB } from './shared';
import { tryMigrate } from './utils';

const indexeddbOrigin = Symbol('indexeddb-provider-origin');
const snapshotOrigin = Symbol('snapshot-origin');

let mergeCount = 500;

/**
 * @internal
 */
const saveAlert = (event: BeforeUnloadEvent) => {
  event.preventDefault();
  return (event.returnValue =
    'Data is not saved. Are you sure you want to leave?');
};

export const writeOperation = async (op: Promise<unknown>) => {
  window.addEventListener('beforeunload', saveAlert, {
    capture: true,
  });
  await op;
  window.removeEventListener('beforeunload', saveAlert, {
    capture: true,
  });
};

export function setMergeCount(count: number) {
  mergeCount = count;
}

export function revertUpdate(
  doc: Doc,
  snapshotUpdate: Uint8Array,
  getMetadata: (key: string) => 'Text' | 'Map' | 'Array'
) {
  const snapshotDoc = new Doc();
  applyUpdate(snapshotDoc, snapshotUpdate, snapshotOrigin);

  const currentStateVector = encodeStateVector(doc);
  const snapshotStateVector = encodeStateVector(snapshotDoc);

  const changesSinceSnapshotUpdate = encodeStateAsUpdate(
    doc,
    snapshotStateVector
  );
  const undoManager = new UndoManager(
    [...snapshotDoc.share.keys()].map(key => {
      const type = getMetadata(key);
      if (type === 'Text') {
        return snapshotDoc.getText(key);
      } else if (type === 'Map') {
        return snapshotDoc.getMap(key);
      } else if (type === 'Array') {
        return snapshotDoc.getArray(key);
      }
      throw new Error('Unknown type');
    }),
    {
      trackedOrigins: new Set([snapshotOrigin]),
    }
  );
  applyUpdate(snapshotDoc, changesSinceSnapshotUpdate, snapshotOrigin);
  undoManager.undo();
  const revertChangesSinceSnapshotUpdate = encodeStateAsUpdate(
    snapshotDoc,
    currentStateVector
  );
  applyUpdate(doc, revertChangesSinceSnapshotUpdate, snapshotOrigin);
}

export class EarlyDisconnectError extends Error {
  constructor() {
    super('Early disconnect');
  }
}

export class CleanupWhenConnectingError extends Error {
  constructor() {
    super('Cleanup when connecting');
  }
}

export const markMilestone = async (
  id: string,
  doc: Doc,
  name: string,
  dbName = DEFAULT_DB_NAME
): Promise<void> => {
  const dbPromise = openDB<BlockSuiteBinaryDB>(dbName, dbVersion, {
    upgrade: upgradeDB,
  });
  const db = await dbPromise;
  const store = db
    .transaction('milestone', 'readwrite')
    .objectStore('milestone');
  const milestone = await store.get('id');
  const binary = encodeStateAsUpdate(doc);
  if (!milestone) {
    await store.put({
      id,
      milestone: {
        [name]: binary,
      },
    });
  } else {
    milestone.milestone[name] = binary;
    await store.put(milestone);
  }
};

export const getMilestones = async (
  id: string,
  dbName: string = DEFAULT_DB_NAME
): Promise<null | WorkspaceMilestone['milestone']> => {
  const dbPromise = openDB<BlockSuiteBinaryDB>(dbName, dbVersion, {
    upgrade: upgradeDB,
  });
  const db = await dbPromise;
  const store = db
    .transaction('milestone', 'readonly')
    .objectStore('milestone');
  const milestone = await store.get(id);
  if (!milestone) {
    return null;
  }
  return milestone.milestone;
};

type SubDocsEvent = {
  added: Set<Doc>;
  removed: Set<Doc>;
  loaded: Set<Doc>;
};

/**
 * We use `doc.guid` as the unique key, please make sure it not changes.
 */
export const createIndexedDBProvider = (
  doc: Doc,
  dbName: string = DEFAULT_DB_NAME,
  /**
   * In the future, migrate will be removed and there will be a separate function
   */
  migrate = true
): IndexedDBProvider => {
  let resolve: () => void;
  let reject: (reason?: unknown) => void;
  let early = true;
  let connected = false;
  const dbPromise = openDB<BlockSuiteBinaryDB>(dbName, dbVersion, {
    upgrade: upgradeDB,
  });

  const updateHandlerMap = new WeakMap<
    Doc,
    (update: Uint8Array, origin: unknown) => void
  >();
  const destroyHandlerMap = new WeakMap<Doc, () => void>();
  const subDocsHandlerMap = new WeakMap<Doc, (event: SubDocsEvent) => void>();

  const createOrGetHandleUpdate = (id: string, doc: Doc) => {
    if (updateHandlerMap.has(doc)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return updateHandlerMap.get(doc)!;
    }
    const fn = async function handleUpdate(
      update: Uint8Array,
      origin: unknown
    ) {
      const db = await dbPromise;
      if (!connected) {
        return;
      }
      if (origin === indexeddbOrigin) {
        return;
      }
      const store = db
        .transaction('workspace', 'readwrite')
        .objectStore('workspace');
      let data = await store.get(id);
      if (!data) {
        data = {
          id,
          updates: [],
        };
      }
      data.updates.push({
        timestamp: Date.now(),
        update,
      });
      if (data.updates.length > mergeCount) {
        const updates = data.updates.map(({ update }) => update);
        const doc = new Doc();
        doc.transact(() => {
          updates.forEach(update => {
            applyUpdate(doc, update, indexeddbOrigin);
          });
        }, indexeddbOrigin);

        const update = encodeStateAsUpdate(doc);
        data = {
          id,
          updates: [
            {
              timestamp: Date.now(),
              update,
            },
          ],
        };
        await writeOperation(store.put(data));
      } else {
        await writeOperation(store.put(data));
      }
    };
    updateHandlerMap.set(doc, fn);
    return fn;
  };

  /* deepscan-disable UNUSED_PARAM */
  const createOrGetHandleDestroy = (_: string, doc: Doc) => {
    if (destroyHandlerMap.has(doc)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return destroyHandlerMap.get(doc)!;
    }
    const fn = async function handleDestroy() {
      const db = await dbPromise;
      db.close();
    };
    destroyHandlerMap.set(doc, fn);
    return fn;
  };

  /* deepscan-disable UNUSED_PARAM */
  const createOrGetHandleSubDocs = (_: string, doc: Doc) => {
    if (subDocsHandlerMap.has(doc)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return subDocsHandlerMap.get(doc)!;
    }
    const fn = async function handleSubDocs(event: SubDocsEvent) {
      event.removed.forEach(doc => {
        unTrackDoc(doc.guid, doc);
      });
      event.loaded.forEach(doc => {
        trackDoc(doc.guid, doc);
      });
    };
    subDocsHandlerMap.set(doc, fn);
    return fn;
  };

  function trackDoc(id: string, doc: Doc) {
    doc.on('update', createOrGetHandleUpdate(id, doc));
    doc.on('destroy', createOrGetHandleDestroy(id, doc));
    doc.on('subdocs', createOrGetHandleSubDocs(id, doc));

    doc.subdocs.forEach(doc => {
      trackDoc(doc.guid, doc);
    });
  }

  function unTrackDoc(id: string, doc: Doc) {
    doc.subdocs.forEach(doc => {
      unTrackDoc(doc.guid, doc);
    });
    doc.off('update', createOrGetHandleUpdate(id, doc));
    doc.off('destroy', createOrGetHandleDestroy(id, doc));
    doc.off('subdocs', createOrGetHandleSubDocs(id, doc));
  }

  async function saveDocOperation(id: string, doc: Doc) {
    const db = await dbPromise;
    const store = db
      .transaction('workspace', 'readwrite')
      .objectStore('workspace');
    const data = await store.get(id);
    if (!connected) {
      return;
    }
    if (!data) {
      await writeOperation(
        db.put('workspace', {
          id,
          updates: [
            {
              timestamp: Date.now(),
              update: encodeStateAsUpdate(doc),
            },
          ],
        })
      );
    } else {
      const updates = data.updates.map(({ update }) => update);
      const fakeDoc = new Doc();
      fakeDoc.transact(() => {
        updates.forEach(update => {
          applyUpdate(fakeDoc, update);
        });
      }, indexeddbOrigin);
      const newUpdate = diffUpdate(
        encodeStateAsUpdate(doc),
        encodeStateAsUpdate(fakeDoc)
      );
      await writeOperation(
        store.put({
          ...data,
          updates: [
            ...data.updates,
            {
              timestamp: Date.now(),
              update: newUpdate,
            },
          ],
        })
      );
      doc.transact(() => {
        updates.forEach(update => {
          applyUpdate(doc, update);
        });
      }, indexeddbOrigin);
    }
  }

  const apis = {
    connect: async () => {
      if (connected) return;

      apis.whenSynced = new Promise<void>((_resolve, _reject) => {
        early = true;
        resolve = _resolve;
        reject = _reject;
      });
      connected = true;
      trackDoc(doc.guid, doc);

      // only the runs `await` below, otherwise the logic is incorrect
      const db = await dbPromise;
      if (migrate) {
        // Tips:
        //  this is only backward compatible with the yjs official version of y-indexeddb
        await tryMigrate(db, doc.guid, dbName);
      }
      if (!connected) {
        return;
      }

      // recursively save all docs into indexeddb
      const docs: [string, Doc][] = [];
      docs.push([doc.guid, doc]);
      while (docs.length > 0) {
        const [id, doc] = docs.pop() as [string, Doc];
        await saveDocOperation(id, doc);
        doc.subdocs.forEach(doc => {
          docs.push([doc.guid, doc]);
        });
      }

      early = false;
      resolve();
    },
    disconnect() {
      connected = false;
      if (early) {
        reject(new EarlyDisconnectError());
      }
      unTrackDoc(doc.guid, doc);
    },
    async cleanup() {
      if (connected) {
        throw new CleanupWhenConnectingError();
      }
      await (await dbPromise).delete('workspace', doc.guid);
    },
    whenSynced: Promise.resolve(),
    get connected() {
      return connected;
    },
  };

  return apis;
};

export * from './shared';
export * from './utils';
