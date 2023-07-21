import type { PassiveDocProvider } from '@blocksuite/store';
import {
  applyUpdate,
  type Doc,
  encodeStateAsUpdate,
  encodeStateVectorFromUpdate,
} from 'yjs';

import type { DatasourceDocAdapter } from './datasource-doc-adapter';

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
  let datasourceUnsub: (() => void) | undefined;

  async function syncDoc(doc: Doc) {
    const guid = doc.guid;
    // perf: optimize me
    const currentUpdate = encodeStateAsUpdate(doc);

    const remoteUpdate = await datasource.queryDocState(guid, {
      stateVector: encodeStateVectorFromUpdate(currentUpdate),
    });

    const updates = [currentUpdate];
    pendingMap.set(guid, []);

    if (remoteUpdate) {
      applyUpdate(doc, remoteUpdate, selfUpdateOrigin);
      const newUpdate = encodeStateAsUpdate(
        doc,
        encodeStateVectorFromUpdate(remoteUpdate)
      );
      updates.push(newUpdate);
      await datasource.sendDocUpdate(guid, newUpdate);
    }
  }

  function setupDocListener(doc: Doc) {
    const disposables = new Set<() => void>();
    disposableMap.set(doc.guid, disposables);
    const updateHandler = async (update: Uint8Array, origin: unknown) => {
      if (origin === selfUpdateOrigin) {
        return;
      }
      datasource.sendDocUpdate(doc.guid, update).catch(console.error);
    };

    const subdocLoadHandler = (event: { loaded: Set<Doc> }) => {
      event.loaded.forEach(subdoc => {
        connectDoc(subdoc).catch(console.error);
      });
    };

    doc.on('update', updateHandler);
    doc.on('subdocs', subdocLoadHandler);
    // todo: handle destroy?
    disposables.add(() => {
      doc.off('update', updateHandler);
      doc.off('subdocs', subdocLoadHandler);
    });
  }

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
    setupDocListener(doc);
    await syncDoc(doc);
    await Promise.all(
      [...doc.subdocs]
        .filter(subdoc => subdoc.shouldLoad)
        .map(subdoc => connectDoc(subdoc))
    );
  }

  function disposeAll() {
    disposableMap.forEach(disposables => {
      disposables.forEach(dispose => dispose());
    });
    disposableMap.clear();
  }

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
