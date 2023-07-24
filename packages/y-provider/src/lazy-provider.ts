import type { PassiveDocProvider } from '@blocksuite/store';
import {
  applyUpdate,
  type Doc,
  encodeStateAsUpdate,
  encodeStateVector,
  encodeStateVectorFromUpdate,
} from 'yjs';

import type { DatasourceDocAdapter } from './types';

const selfUpdateOrigin = 'lazy-provider-self-origin';

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

/**
 * Creates a lazy provider that connects to a datasource and synchronizes a root document.
 */
export const createLazyProvider = (
  rootDoc: Doc,
  datasource: DatasourceDocAdapter
): Omit<PassiveDocProvider, 'flavour'> => {
  let connected = false;
  const pendingMap = new Map<string, Uint8Array[]>(); // guid -> pending-updates
  const disposableMap = new Map<string, Set<() => void>>();
  const connectedDocs = new Set<string>();
  let datasourceUnsub: (() => void) | undefined;

  async function syncDoc(doc: Doc) {
    const guid = doc.guid;

    const remoteUpdate = await datasource.queryDocState(guid, {
      stateVector: encodeStateVector(doc),
    });

    pendingMap.set(guid, []);

    if (remoteUpdate) {
      applyUpdate(doc, remoteUpdate, selfUpdateOrigin);
    }

    const sv = remoteUpdate
      ? encodeStateVectorFromUpdate(remoteUpdate)
      : undefined;

    // perf: optimize me
    // it is possible the doc is only in memory but not yet in the datasource
    // we need to send the whole update to the datasource
    await datasource.sendDocUpdate(guid, encodeStateAsUpdate(doc, sv));
  }

  /**
   * Sets up event listeners for a Yjs document.
   * @param doc - The Yjs document to set up listeners for.
   */
  function setupDocListener(doc: Doc) {
    const disposables = new Set<() => void>();
    disposableMap.set(doc.guid, disposables);
    const updateHandler = async (update: Uint8Array, origin: unknown) => {
      if (origin === selfUpdateOrigin) {
        return;
      }
      datasource.sendDocUpdate(doc.guid, update).catch(console.error);
    };

    const subdocsHandler = (event: { loaded: Set<Doc>; removed: Set<Doc> }) => {
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
    datasourceUnsub = datasource.onDocUpdate?.((guid, update) => {
      const doc = getDoc(rootDoc, guid);
      if (doc) {
        applyUpdate(doc, update);
        //
        if (pendingMap.has(guid)) {
          pendingMap.get(guid)?.forEach(update => applyUpdate(doc, update));
          pendingMap.delete(guid);
        }
      } else {
        // This case happens when the father doc is not yet updated,
        //  so that the child doc is not yet created.
        //  We need to put it into cache so that it can be applied later.
        console.warn('idb: doc not found', guid);
        pendingMap.set(guid, (pendingMap.get(guid) ?? []).concat(update));
      }
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

    // root doc should be already loaded,
    // but we want to populate the cache for later update events
    connectDoc(rootDoc).catch(console.error);
    setupDatasourceListeners();
  }

  async function disconnect() {
    connected = false;
    disposeAll();
    datasourceUnsub?.();
    datasourceUnsub = undefined;
  }

  return {
    get connected() {
      return connected;
    },
    passive: true,
    connect,
    disconnect,
  };
};
