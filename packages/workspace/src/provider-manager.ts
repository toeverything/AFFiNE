import { assertExists } from '@blocksuite/global/utils';
import type { BaseDocProvider } from '@blocksuite/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Doc } from 'yjs';
import { encodeStateAsUpdate, mergeUpdates } from 'yjs';

type SubDocsEvent = {
  added: Set<Doc>;
  removed: Set<Doc>;
  loaded: Set<Doc>;
};

type LinkedListNode<T, M extends Record<string, unknown>> = {
  value: T;
  metadata: M;
  next: LinkedListNode<T, M> | null;
  prev: LinkedListNode<T, M> | null;
};

type Metadata = {
  origin: unknown;
  timestamp: number;
};

const snapshotWeakMap = new WeakMap<
  Doc,
  LinkedListNode<Uint8Array, Metadata> | null
>();

const docUpdateWeakMap = new WeakMap<Doc, Uint8Array>();
const docUpdateCallbackWeakMap = new WeakMap<
  Doc,
  (update: Uint8Array) => void
>();
const docDestroyCallbackWeakMap = new WeakMap<Doc, () => void>();

function initializeDocUpdateWeakMap(doc: Doc) {
  docUpdateWeakMap.set(doc, encodeStateAsUpdate(doc));
  const onUpdate = (update: Uint8Array) => {
    const oldUpdate = docUpdateWeakMap.get(doc) as Uint8Array;
    assertExists(oldUpdate);
    docUpdateWeakMap.set(doc, mergeUpdates([oldUpdate, update]));
  };
  doc.on('update', onUpdate);
  const onSubdocs = (event: SubDocsEvent) => {
    event.added.forEach(doc => {
      initializeDocUpdateWeakMap(doc);
    });
    event.removed.forEach(doc => {
      _destroyDocUpdateWeakMap(doc);
    });
  };
  doc.on('subdocs', onSubdocs);
  docUpdateCallbackWeakMap.set(doc, onUpdate);
  const onDestroy = () => {
    doc.off('update', onUpdate);
    doc.off('subdocs', onSubdocs);
  };
  doc.once('destroy', onDestroy);
  docDestroyCallbackWeakMap.set(doc, onDestroy);
  doc.subdocs.forEach(doc => {
    initializeDocUpdateWeakMap(doc);
  });
}

export const captureSnapshot = (rootDoc: Doc, origin: unknown) => {
  const snapshot = docUpdateWeakMap.get(rootDoc) as Uint8Array;
  const node: LinkedListNode<Uint8Array, Metadata> = {
    value: snapshot,
    metadata: {
      origin,
      timestamp: Date.now(),
    },
    next: null,
    prev: null,
  };
  const head = snapshotWeakMap.get(rootDoc);
  if (head) {
    head.prev = node;
    node.next = head;
  }
  snapshotWeakMap.set(rootDoc, node);
  rootDoc.subdocs.forEach(doc => {
    captureSnapshot(doc, origin);
  });
};

export const getSnapshotList = (rootDoc: Doc) => {
  const head = snapshotWeakMap.get(rootDoc);
  if (!head) {
    return [];
  }
  const snapshots: LinkedListNode<Uint8Array, Metadata>[] = [];
  let node = head;
  while (node) {
    snapshots.push(node);
    node = node.next as LinkedListNode<Uint8Array, Metadata>;
  }
  return snapshots;
};

function _destroyDocUpdateWeakMap(doc: Doc) {
  const onDestroy = docDestroyCallbackWeakMap.get(doc);
  if (onDestroy) {
    onDestroy();
    docDestroyCallbackWeakMap.delete(doc);
  }
  const onUpdate = docUpdateCallbackWeakMap.get(doc);
  if (onUpdate) {
    doc.off('update', onUpdate);
    docUpdateCallbackWeakMap.delete(doc);
  }
  docUpdateWeakMap.delete(doc);
  doc.subdocs.forEach(doc => {
    _destroyDocUpdateWeakMap(doc);
  });
}

export const createProviderManager = (doc: Doc) => {
  initializeDocUpdateWeakMap(doc);
  const originMap = new Map<BaseDocProvider, unknown>();
  const lastUpdateWeakMap = new WeakMap<BaseDocProvider, Date>();
  const lastUpdateCallbackWeakMap = new WeakMap<
    BaseDocProvider,
    Set<() => void>
  >();
  const updateCallbackWeakMap = new WeakMap<
    BaseDocProvider,
    (provider: Uint8Array, origin: any) => void
  >();
  const subdocsCallbackWeakMap = new WeakMap<
    BaseDocProvider,
    (event: SubDocsEvent) => void
  >();
  return {
    on: (
      provider: BaseDocProvider,
      event: 'lastUpdate',
      callback: () => void
    ): (() => void) => {
      if (!lastUpdateCallbackWeakMap.has(provider)) {
        lastUpdateCallbackWeakMap.set(provider, new Set());
      }
      const set = lastUpdateCallbackWeakMap.get(provider) as Set<() => void>;
      if (event === 'lastUpdate') {
        const updateCallback = () => {
          callback();
        };
        set.add(updateCallback);
        return () => {
          set.delete(updateCallback);
        };
      }
      throw new Error('Unknown type');
    },
    lastUpdate: (provider: BaseDocProvider): Date | null => {
      return lastUpdateWeakMap.get(provider) ?? null;
    },
    listen: <T>(provider: BaseDocProvider, origin: T) => {
      originMap.set(provider, origin);
      const callback = (_: Uint8Array, origin: T) => {
        if (origin === originMap.get(provider)) {
          lastUpdateWeakMap.set(provider, new Date());
          lastUpdateCallbackWeakMap.get(provider)?.forEach(callback => {
            callback();
          });
        }
      };
      const subdocsCallback = (event: SubDocsEvent) => {
        event.loaded.forEach(doc => {
          doc.on('update', callback);
        });
        event.removed.forEach(doc => {
          doc.off('update', callback);
        });
      };
      doc.on('update', callback);
      doc.on('subdocs', subdocsCallback);
      doc.subdocs.forEach(doc => {
        doc.on('update', callback);
      });
      updateCallbackWeakMap.set(provider, callback);
      subdocsCallbackWeakMap.set(provider, subdocsCallback);
    },
    close: (provider: BaseDocProvider) => {
      const callback = updateCallbackWeakMap.get(provider);
      if (callback) {
        doc.off('update', callback);
        doc.subdocs.forEach(doc => {
          doc.off('update', callback);
        });
      } else {
        if (process.env.NODE_ENV === 'development') {
          throw new Error('Callback not found');
        }
        console.warn('Callback not found');
      }
      const subdocsCallback = subdocsCallbackWeakMap.get(provider);
      if (subdocsCallback) {
        doc.off('subdocs', subdocsCallback);
        doc.subdocs.forEach(doc => {
          doc.off('update', subdocsCallback);
        });
      } else {
        if (process.env.NODE_ENV === 'development') {
          throw new Error('Subdocs callback not found');
        }
        console.warn('Subdocs callback not found');
      }
    },
  };
};

type Manager = ReturnType<typeof createProviderManager>;

export function useProviderIsOutdated(
  manager: Manager,
  provider: BaseDocProvider,
  timeout: number
) {
  const oldUpdateRef = useRef<Date | null>(null);
  if (!oldUpdateRef.current) {
    oldUpdateRef.current = manager.lastUpdate(provider);
  }
  const [outdated, setOutdated] = useState(false);
  const getSnapshot = useCallback(
    () => manager['lastUpdate'](provider),
    [manager, provider]
  );
  useEffect(() => {
    const timer = setInterval(() => {
      const lastUpdate = getSnapshot();
      assertExists(oldUpdateRef.current);
      assertExists(lastUpdate);
      if (lastUpdate.getTime() - oldUpdateRef.current.getTime() > timeout) {
        setOutdated(true);
      } else {
        setOutdated(false);
        oldUpdateRef.current = lastUpdate;
      }
    }, timeout);
    return () => {
      clearInterval(timer);
    };
  }, [getSnapshot, timeout]);
  return outdated;
}
