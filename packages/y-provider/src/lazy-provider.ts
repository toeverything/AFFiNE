import { assertExists } from '@blocksuite/global/utils';
import {
  applyUpdate,
  type Doc,
  encodeStateAsUpdate,
  encodeStateVector,
} from 'yjs';

import type { DatasourceDocAdapter } from './data-source';
import type { StatusAdapter } from './types';
import type { Status } from './types';

function getDoc(doc: Doc, guid: string): Doc | undefined {
  if (doc.guid === guid) {
    return doc;
  }
  for (const subdoc of doc.subdocs) {
    const found = getDoc(subdoc, guid);
    if (found) {
      return found;
    }
  }
  return undefined;
}

interface LazyProviderOptions {
  origin?: string;
}

export type DocProvider = {
  // backport from `@blocksuite/store`
  passive: true;

  sync(onlyRootDoc?: boolean): Promise<void>;

  get connected(): boolean;
  connect(): void;
  disconnect(): void;
};

/**
 * Creates a lazy provider that connects to a datasource and synchronizes a root document.
 */
export const createLazyProvider = (
  rootDoc: Doc,
  datasource: DatasourceDocAdapter,
  options: LazyProviderOptions = {}
): DocProvider & StatusAdapter => {
  let connected = false;
  const pendingMap = new Map<string, Uint8Array[]>(); // guid -> pending-updates
  const disposableMap = new Map<string, Set<() => void>>();
  const connectedDocs = new Set<string>();
  let abortController: AbortController | null = null;

  const { origin = 'lazy-provider' } = options;

  // todo: should we use a real state machine here like `xstate`?
  let currentStatus: Status = {
    type: 'idle',
  };
  let syncingStack = 0;
  const callbackSet = new Set<() => void>();
  const changeStatus = (newStatus: Status) => {
    // simulate a stack, each syncing and synced should be paired
    if (newStatus.type === 'idle') {
      if (connected && syncingStack !== 0) {
        console.error('syncingStatus !== 0, this should not happen');
      }
      syncingStack = 0;
    }
    if (newStatus.type === 'syncing') {
      syncingStack++;
    }
    if (newStatus.type === 'synced' || newStatus.type === 'error') {
      syncingStack--;
    }

    if (syncingStack < 0) {
      console.error('syncingStatus < 0, this should not happen');
    }

    if (syncingStack === 0) {
      currentStatus = newStatus;
    }
    if (newStatus.type !== 'synced') {
      currentStatus = newStatus;
    }
    callbackSet.forEach(cb => cb());
  };

  async function syncDoc(doc: Doc) {
    const guid = doc.guid;
    if (!connected) {
      return;
    }

    changeStatus({
      type: 'syncing',
    });
    const remoteUpdate = await datasource
      .queryDocState(guid, {
        stateVector: encodeStateVector(doc),
      })
      .then(remoteUpdate => {
        if (!connected) {
          changeStatus({
            type: 'idle',
          });
          return;
        }
        changeStatus({
          type: 'synced',
        });
        return remoteUpdate;
      })
      .catch(error => {
        changeStatus({
          type: 'error',
          error,
        });
        throw error;
      });

    pendingMap.set(guid, []);

    if (remoteUpdate) {
      applyUpdate(doc, remoteUpdate.missing, origin);
    }

    if (!connected) {
      return;
    }

    // perf: optimize me
    // it is possible the doc is only in memory but not yet in the datasource
    // we need to send the whole update to the datasource
    await datasource.sendDocUpdate(
      guid,
      encodeStateAsUpdate(doc, remoteUpdate ? remoteUpdate.state : undefined)
    );

    doc.emit('sync', []);
  }

  /**
   * Sets up event listeners for a Yjs document.
   * @param doc - The Yjs document to set up listeners for.
   */
  function setupDocListener(doc: Doc) {
    const disposables = new Set<() => void>();
    disposableMap.set(doc.guid, disposables);
    const updateHandler = async (update: Uint8Array, updateOrigin: unknown) => {
      if (origin === updateOrigin) {
        return;
      }
      changeStatus({
        type: 'syncing',
      });
      datasource
        .sendDocUpdate(doc.guid, update)
        .then(() => {
          changeStatus({
            type: 'synced',
          });
        })
        .catch(error => {
          changeStatus({
            type: 'error',
            error,
          });
          console.error(error);
        });
    };

    const subdocsHandler = (event: {
      loaded: Set<Doc>;
      removed: Set<Doc>;
      added: Set<Doc>;
    }) => {
      event.loaded.forEach(subdoc => {
        connectDoc(subdoc).catch(console.error);
      });
      event.removed.forEach(subdoc => {
        disposeDoc(subdoc);
      });
    };

    doc.on('update', updateHandler);
    doc.on('subdocs', subdocsHandler);
    // todo: handle destroy?
    disposables.add(() => {
      doc.off('update', updateHandler);
      doc.off('subdocs', subdocsHandler);
    });
  }

  /**
   * Sets up event listeners for the datasource.
   * Specifically, listens for updates to documents and applies them to the corresponding Yjs document.
   */
  function setupDatasourceListeners() {
    assertExists(abortController, 'abortController should be defined');
    const unsubscribe = datasource.onDocUpdate?.((guid, update) => {
      if (!connected) {
        return;
      }
      changeStatus({
        type: 'syncing',
      });
      const doc = getDoc(rootDoc, guid);
      if (doc) {
        applyUpdate(doc, update, origin);
        //
        if (pendingMap.has(guid)) {
          pendingMap
            .get(guid)
            ?.forEach(update => applyUpdate(doc, update, origin));
          pendingMap.delete(guid);
        }
      } else {
        // This case happens when the father doc is not yet updated,
        //  so that the child doc is not yet created.
        //  We need to put it into cache so that it can be applied later.
        console.warn('doc not found', guid);
        pendingMap.set(guid, (pendingMap.get(guid) ?? []).concat(update));
      }
      changeStatus({
        type: 'synced',
      });
    });
    abortController.signal.addEventListener('abort', () => {
      unsubscribe?.();
    });
  }

  // when a subdoc is loaded, we need to sync it with the datasource and setup listeners
  async function connectDoc(doc: Doc) {
    // skip if already connected
    if (connectedDocs.has(doc.guid)) {
      return;
    }
    connectedDocs.add(doc.guid);
    setupDocListener(doc);
    await syncDoc(doc);

    await Promise.all(
      [...doc.subdocs]
        .filter(subdoc => subdoc.shouldLoad)
        .map(subdoc => connectDoc(subdoc))
    );
  }

  function disposeDoc(doc: Doc) {
    connectedDocs.delete(doc.guid);
    const disposables = disposableMap.get(doc.guid);
    if (disposables) {
      disposables.forEach(dispose => dispose());
      disposableMap.delete(doc.guid);
    }
    // also dispose all subdocs
    doc.subdocs.forEach(disposeDoc);
  }

  function disposeAll() {
    disposableMap.forEach(disposables => {
      disposables.forEach(dispose => dispose());
    });
    disposableMap.clear();
    connectedDocs.clear();
  }

  /**
   * Connects to the datasource and sets up event listeners for document updates.
   */
  function connect() {
    connected = true;
    abortController = new AbortController();

    changeStatus({
      type: 'syncing',
    });
    // root doc should be already loaded,
    // but we want to populate the cache for later update events
    connectDoc(rootDoc)
      .then(() => {
        if (!connected) {
          changeStatus({
            type: 'idle',
          });
          return;
        }
        changeStatus({
          type: 'synced',
        });
      })
      .catch(error => {
        changeStatus({
          type: 'error',
          error,
        });
        console.error(error);
      });
    setupDatasourceListeners();
  }

  async function disconnect() {
    connected = false;
    changeStatus({
      type: 'idle',
    });
    disposeAll();
    assertExists(abortController, 'abortController should be defined');
    abortController.abort();
    abortController = null;
  }

  const syncDocRecursive = async (doc: Doc) => {
    await syncDoc(doc);
    await Promise.all(
      [...doc.subdocs.values()].map(subdoc => syncDocRecursive(subdoc))
    );
  };

  return {
    sync: async onlyRootDoc => {
      connected = true;
      try {
        if (onlyRootDoc) {
          await syncDoc(rootDoc);
        } else {
          await syncDocRecursive(rootDoc);
        }
      } finally {
        connected = false;
      }
    },
    get status() {
      return currentStatus;
    },
    subscribeStatusChange(cb: () => void) {
      callbackSet.add(cb);
      return () => {
        callbackSet.delete(cb);
      };
    },
    get connected() {
      return connected;
    },
    passive: true,
    connect,
    disconnect,
  };
};
