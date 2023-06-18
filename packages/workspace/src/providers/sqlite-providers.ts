import type {
  SQLiteDBDownloadProvider,
  SQLiteProvider,
} from '@affine/env/workspace';
import type { BlobManager } from '@blocksuite/store';
import {
  assertExists,
  Workspace as BlockSuiteWorkspace,
} from '@blocksuite/store';
import type { Doc } from 'yjs';

import { CallbackSet } from '../utils';
import { localProviderLogger as logger } from './logger';

const Y = BlockSuiteWorkspace.Y;

const sqliteOrigin = Symbol('sqlite-provider-origin');

type SubDocsEvent = {
  added: Set<Doc>;
  removed: Set<Doc>;
  loaded: Set<Doc>;
};

/**
 * A provider that is responsible for syncing updates the workspace with the local SQLite database.
 */
export const createSQLiteProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): SQLiteProvider => {
  const { apis, events } = window;
  // make sure it is being used in Electron with APIs
  assertExists(apis);
  assertExists(events);

  const updateHandlerMap = new WeakMap<
    Doc,
    (update: Uint8Array, origin: unknown) => void
  >();
  const subDocsHandlerMap = new WeakMap<Doc, (event: SubDocsEvent) => void>();

  const createOrHandleUpdate = (doc: Doc) => {
    if (updateHandlerMap.has(doc)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return updateHandlerMap.get(doc)!;
    }

    function handleUpdate(update: Uint8Array, origin: unknown) {
      if (origin === sqliteOrigin) {
        return;
      }
      const workspaceId = blockSuiteWorkspace.id;
      const subdocId = doc.guid === workspaceId ? undefined : doc.guid;
      apis.db
        .applyDocUpdate(blockSuiteWorkspace.id, update, subdocId)
        .catch(err => {
          console.error(err);
        });
    }
    updateHandlerMap.set(doc, handleUpdate);
    return handleUpdate;
  };

  const createOrGetHandleSubDocs = (doc: Doc) => {
    if (subDocsHandlerMap.has(doc)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return subDocsHandlerMap.get(doc)!;
    }
    function handleSubdocs(event: SubDocsEvent) {
      event.removed.forEach(doc => {
        untrackDoc(doc);
      });
      event.loaded.forEach(doc => {
        trackDoc(doc);
      });
    }
    subDocsHandlerMap.set(doc, handleSubdocs);
    return handleSubdocs;
  };

  function trackDoc(doc: Doc) {
    doc.on('update', createOrHandleUpdate(doc));
    doc.on('subdocs', createOrGetHandleSubDocs(doc));
  }

  function untrackDoc(doc: Doc) {
    doc.subdocs.forEach(doc => {
      untrackDoc(doc);
    });
    doc.off('update', createOrHandleUpdate(doc));
    doc.off('subdocs', createOrGetHandleSubDocs(doc));
  }

  let unsubscribe = () => {};
  let connected = false;

  const connect = () => {
    logger.info('connecting sqlite provider', blockSuiteWorkspace.id);
    const doc = blockSuiteWorkspace.doc;
    trackDoc(doc);
    doc.subdocs.forEach(subdoc => {
      if (subdoc.shouldLoad) {
        subdoc.whenLoaded
          .then(() => {
            trackDoc(subdoc);
          })
          .catch(err => {
            console.error(err);
          });
      }
    });

    unsubscribe = events.db.onExternalUpdate(
      ({
        update,
        workspaceId,
      }: {
        workspaceId: string;
        update: Uint8Array;
      }) => {
        if (workspaceId === blockSuiteWorkspace.id) {
          Y.applyUpdate(blockSuiteWorkspace.doc, update, sqliteOrigin);
        }
      }
    );
    connected = true;
    logger.info('connecting sqlite done', blockSuiteWorkspace.id);
  };

  const cleanup = () => {
    logger.info('disconnecting sqlite provider', blockSuiteWorkspace.id);
    unsubscribe();
    untrackDoc(blockSuiteWorkspace.doc);
    connected = false;
  };

  return {
    flavour: 'sqlite',
    background: true,
    callbacks: new CallbackSet(),
    get connected(): boolean {
      return connected;
    },
    cleanup,
    connect,
    disconnect: cleanup,
  };
};

/**
 * A provider that is responsible for DOWNLOADING updates from the local SQLite database.
 */
export const createSQLiteDBDownloadProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): SQLiteDBDownloadProvider => {
  const { apis } = window;
  let disconnected = false;

  let _resolve: () => void;
  let _reject: (error: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
  });

  async function syncUpdates(doc: Doc) {
    logger.info('syncing updates from sqlite', blockSuiteWorkspace.id);
    const subdocId = doc.guid === blockSuiteWorkspace.id ? undefined : doc.guid;
    const updates = await apis.db.getDocAsUpdates(
      blockSuiteWorkspace.id,
      subdocId
    );

    if (disconnected) {
      return false;
    }

    if (updates) {
      Y.applyUpdate(doc, updates, sqliteOrigin);
      // load event will
      // - change isLoaded to true
      // - resolve doc.whenLoaded
      doc.emit('load', []);
    }

    const diff = Y.encodeStateAsUpdate(doc, updates);

    // also apply updates to sqlite
    await apis.db.applyDocUpdate(blockSuiteWorkspace.id, diff, subdocId);

    return true;
  }

  async function syncBlobIntoSQLite(bs: BlobManager) {
    const persistedKeys = await apis.db.getBlobKeys(blockSuiteWorkspace.id);

    if (disconnected) {
      return;
    }

    const allKeys = await bs.list().catch(() => []);
    const keysToPersist = allKeys.filter(k => !persistedKeys.includes(k));

    logger.info('persisting blobs', keysToPersist, 'to sqlite');
    return Promise.all(
      keysToPersist.map(async k => {
        const blob = await bs.get(k);
        if (!blob) {
          logger.warn('blob not found for', k);
          return;
        }

        if (disconnected) {
          return;
        }

        return apis?.db.addBlob(
          blockSuiteWorkspace.id,
          k,
          new Uint8Array(await blob.arrayBuffer())
        );
      })
    );
  }

  async function syncAllUpdates(doc: Doc) {
    if (await syncUpdates(doc)) {
      const subdocs = Array.from(doc.subdocs).filter(d => d.shouldLoad);
      await Promise.all(subdocs.map(syncUpdates));
    }
  }

  return {
    flavour: 'sqlite-download',
    necessary: true,
    get whenReady() {
      return promise;
    },
    cleanup: () => {
      disconnected = true;
    },
    sync: async () => {
      logger.info('connect indexeddb provider', blockSuiteWorkspace.id);
      try {
        await syncAllUpdates(blockSuiteWorkspace.doc);
        const bs = blockSuiteWorkspace.blobs;
        if (bs && !disconnected) {
          await syncBlobIntoSQLite(bs);
        }
        _resolve();
      } catch (error) {
        _reject(error);
      }
    },
  };
};
