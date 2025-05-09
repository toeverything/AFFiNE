import { signal } from '@preact/signals-core';

import { isPureObject } from '../is-pure-object';
import { native2Y } from '../native-y';
import type { UnRecord } from '../types';
import { signalUpdater } from './signal-updater';
import type { CreateProxyOptions } from './types';
import {
  bindOnChangeIfNeed,
  getFirstKey,
  isProxy,
  keyWithPrefix,
  markProxy,
} from './utils';
import { yMapUpdater } from './y-map-updater';

export function createProxy(options: CreateProxyOptions): UnRecord {
  const { base } = options;

  if (isProxy(base)) {
    return base;
  }

  initializeProxy(options);

  const proxyHandler = createProxyHandler(options);
  const proxy = new Proxy(base, proxyHandler);
  markProxy(proxy);

  return proxy;
}

function initializeProxy(options: CreateProxyOptions) {
  const { basePath, yMap, base, root } = options;

  Object.entries(base).forEach(([key, value]) => {
    if (isPureObject(value) && !isProxy(value)) {
      const proxy = createProxy({
        ...options,
        yMap,
        base: value as UnRecord,
        root,
        basePath: basePath ? `${basePath}.${key}` : key,
      });
      base[key] = proxy;
    }
  });
}

function updateSignal(
  value: unknown,
  prop: string,
  receiver: any,
  options: CreateProxyOptions
) {
  const {
    root,
    shouldByPassSignal,
    byPassSignalUpdate,
    onChange,
    basePath,
    initialized,
    onDispose,
    shouldByPassYjs,
  } = options;

  const fullPath = basePath ? `${basePath}.${prop}` : prop;
  const firstKey = getFirstKey(fullPath);
  signalUpdater({
    root,
    firstKey,
    shouldByPassSignal,
    shouldByPassYjs,
    byPassSignalUpdate,
    onChange,
    basePath,
    value,
    handleNestedUpdate: (signalKey: string) => {
      if (value === undefined) {
        delete root[signalKey];
        return;
      }

      const signalData = signal(value);
      root[signalKey] = signalData;
      const unsubscribe = signalData.subscribe(next => {
        if (!initialized()) {
          return;
        }
        byPassSignalUpdate(() => {
          receiver[prop] = next;
          onChange?.(firstKey, true);
        });
      });
      const subscription = onDispose.subscribe(() => {
        subscription.unsubscribe();
        unsubscribe();
      });
    },
  });
}

function createProxyHandler(
  options: CreateProxyOptions
): ProxyHandler<UnRecord> {
  const {
    yMap,
    shouldByPassYjs,
    basePath,
    onChange,
    initialized,
    transform,
    stashed,
  } = options;

  return {
    has: (target, p) => {
      return Reflect.has(target, p);
    },
    get: (target, p, receiver) => {
      return Reflect.get(target, p, receiver);
    },
    set: (target, p, value, receiver) => {
      if (typeof p === 'string') {
        const fullPath = basePath ? `${basePath}.${p}` : p;
        const firstKey = getFirstKey(fullPath);
        const isStashed = stashed.has(firstKey);

        if (isPureObject(value)) {
          const syncYMap = () =>
            yMapUpdater({
              shouldByPassYjs,
              yMap,
              initialized,
              onChange,
              fullPath,
              value,
            });

          if (!isStashed) {
            syncYMap();
          }

          const next = createProxy({
            ...options,
            basePath: fullPath,
            base: value as UnRecord,
          });

          const result = Reflect.set(target, p, next, receiver);
          updateSignal(next, p, receiver, options);
          return result;
        }

        bindOnChangeIfNeed(value, () => {
          onChange?.(firstKey, true);
        });
        const yValue = native2Y(value);
        const next = transform(firstKey, value, yValue);

        if (!isStashed && initialized() && !shouldByPassYjs()) {
          yMap.doc?.transact(
            () => {
              yMap.set(keyWithPrefix(fullPath), yValue);
            },
            { proxy: true }
          );
        }

        const result = Reflect.set(target, p, next, receiver);
        updateSignal(next, p, receiver, options);
        return result;
      }
      return Reflect.set(target, p, value, receiver);
    },
    deleteProperty: (target, p) => {
      if (typeof p === 'string') {
        const fullPath = basePath ? `${basePath}.${p}` : p;
        const firstKey = getFirstKey(fullPath);
        const isStashed = stashed.has(firstKey);

        if (!isStashed && initialized() && !shouldByPassYjs()) {
          yMap.doc?.transact(
            () => {
              const fullKey = keyWithPrefix(fullPath);
              yMap.forEach((_, key) => {
                if (key.startsWith(fullKey)) {
                  yMap.delete(key);
                }
              });
            },
            { proxy: true }
          );
        }

        const result = Reflect.deleteProperty(target, p);
        updateSignal(undefined, p, undefined, options);
        return result;
      }
      return Reflect.deleteProperty(target, p);
    },
  };
}
