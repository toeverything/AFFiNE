import { assertExists } from '@blocksuite/global/utils';
import type { BaseDocProvider } from '@blocksuite/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Doc } from 'yjs';

type SubDocsEvent = {
  added: Set<Doc>;
  removed: Set<Doc>;
  loaded: Set<Doc>;
};

export const createProviderManager = (doc: Doc) => {
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
