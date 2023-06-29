import type {
  SQLiteDBDownloadProvider,
  SQLiteProvider,
} from '@affine/env/workspace';
import type { DocProviderCreator } from '@blocksuite/store';
import {
  assertExists,
  Workspace as BlockSuiteWorkspace,
} from '@blocksuite/store';
import type { Doc } from 'yjs';

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
export const createSQLiteProvider: DocProviderCreator = (
  id,
  rootDoc
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
      const subdocId = doc.guid === id ? undefined : doc.guid;
      apis.db.applyDocUpdate(id, update, subdocId).catch(err => {
        logger.error(err);
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
    doc.subdocs.forEach(doc => {
      trackDoc(doc);
    });
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
    logger.info('connecting sqlite provider', id);
    trackDoc(rootDoc);

    unsubscribe = events.db.onExternalUpdate(
      ({
        update,
        workspaceId,
        docId,
      }: {
        workspaceId: string;
        update: Uint8Array;
        docId?: string;
      }) => {
        if (workspaceId === id) {
          if (docId) {
            for (const doc of rootDoc.subdocs) {
              if (doc.guid === docId) {
                Y.applyUpdate(doc, update, sqliteOrigin);
                return;
              }
            }
          } else {
            Y.applyUpdate(rootDoc, update, sqliteOrigin);
          }
        }
      }
    );
    connected = true;
    logger.info('connecting sqlite done', id);
  };

  const cleanup = () => {
    logger.info('disconnecting sqlite provider', id);
    unsubscribe();
    untrackDoc(rootDoc);
    connected = false;
  };

  return {
    flavour: 'sqlite',
    passive: true,
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
export const createSQLiteDBDownloadProvider: DocProviderCreator = (
  id,
  rootDoc
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
    logger.info('syncing updates from sqlite', id);
    const subdocId = doc.guid === id ? undefined : doc.guid;
    const updates = await apis.db.getDocAsUpdates(id, subdocId);

    if (disconnected) {
      return false;
    }

    if (updates) {
      Y.applyUpdate(doc, updates, sqliteOrigin);
    }

    const diff = Y.encodeStateAsUpdate(doc, updates);

    // also apply updates to sqlite
    await apis.db.applyDocUpdate(id, diff, subdocId);

    return true;
  }

  async function syncAllUpdates(doc: Doc) {
    if (await syncUpdates(doc)) {
      const subdocs = Array.from(doc.subdocs).filter(d => d.shouldLoad);
      await Promise.all(subdocs.map(syncAllUpdates));
    }
  }

  return {
    flavour: 'sqlite-download',
    active: true,
    get whenReady() {
      return promise;
    },
    cleanup: () => {
      disconnected = true;
    },
    sync: async () => {
      logger.info('connect indexeddb provider', id);
      try {
        await syncAllUpdates(rootDoc);
        _resolve();
      } catch (error) {
        _reject(error);
      }
    },
  };
};
