import * as AFFiNEComponent from '@affine/component';
import { DebugLogger } from '@affine/debug';
import * as BlockSuiteBlocksStd from '@blocksuite/blocks/std';
import * as BlockSuiteGlobalUtils from '@blocksuite/global/utils';
import * as Icons from '@blocksuite/icons';
import * as Atom from '@toeverything/plugin-infra/atom';
import * as Jotai from 'jotai/index';
import * as JotaiUtils from 'jotai/utils';
import * as React from 'react';
import * as ReactJSXRuntime from 'react/jsx-runtime';
import * as ReactDom from 'react-dom';
import * as ReactDomClient from 'react-dom/client';
import * as SWR from 'swr';

import { createFetch } from './endowments/fercher';
import { createTimers } from './endowments/timer';

const logger = new DebugLogger('plugins:permission');

const setupImportsMap = () => {
  importsMap.set('react', new Map(Object.entries(React)));
  importsMap.set('react/jsx-runtime', new Map(Object.entries(ReactJSXRuntime)));
  importsMap.set('react-dom', new Map(Object.entries(ReactDom)));
  importsMap.set('react-dom/client', new Map(Object.entries(ReactDomClient)));
  importsMap.set('@blocksuite/icons', new Map(Object.entries(Icons)));
  importsMap.set('@affine/component', new Map(Object.entries(AFFiNEComponent)));
  importsMap.set(
    '@blocksuite/blocks/std',
    new Map(Object.entries(BlockSuiteBlocksStd))
  );
  importsMap.set(
    '@blocksuite/global/utils',
    new Map(Object.entries(BlockSuiteGlobalUtils))
  );
  importsMap.set('jotai', new Map(Object.entries(Jotai)));
  importsMap.set('jotai/utils', new Map(Object.entries(JotaiUtils)));
  importsMap.set(
    '@toeverything/plugin-infra/atom',
    new Map(Object.entries(Atom))
  );
  importsMap.set('swr', new Map(Object.entries(SWR)));
};

const importsMap = new Map<string, Map<string, any>>();
setupImportsMap();
export { importsMap };

const abortController = new AbortController();

const pluginFetch = createFetch({});
const timer = createTimers(abortController.signal);

const sharedGlobalThis = Object.assign(Object.create(null), timer, {
  fetch: pluginFetch,
});

export const createGlobalThis = (name: string) => {
  return Object.assign(Object.create(null), sharedGlobalThis, {
    process: Object.freeze({
      env: {
        NODE_ENV: process.env.NODE_ENV,
      },
    }),
    // UNSAFE: React will read `window` and `document`
    window: new Proxy(
      {},
      {
        get(_, key) {
          logger.debug(`${name} is accessing window`, key);
          if (sharedGlobalThis[key]) return sharedGlobalThis[key];
          const result = Reflect.get(window, key);
          if (typeof result === 'function') {
            return function (...args: any[]) {
              logger.debug(`${name} is calling window`, key, args);
              return result.apply(window, args);
            };
          }
          logger.debug('window', key, result);
          return result;
        },
      }
    ),
    document: new Proxy(
      {},
      {
        get(_, key) {
          logger.debug(`${name} is accessing document`, key);
          if (sharedGlobalThis[key]) return sharedGlobalThis[key];
          const result = Reflect.get(document, key);
          if (typeof result === 'function') {
            return function (...args: any[]) {
              logger.debug(`${name} is calling window`, key, args);
              return result.apply(document, args);
            };
          }
          logger.debug('document', key, result);
          return result;
        },
      }
    ),
    navigator: {
      userAgent: navigator.userAgent,
    },

    // safe to use for all plugins
    Error: globalThis.Error,
    TypeError: globalThis.TypeError,
    RangeError: globalThis.RangeError,
    console: globalThis.console,
    crypto: globalThis.crypto,

    // copilot uses these
    CustomEvent: globalThis.CustomEvent,
    Date: globalThis.Date,
    Math: globalThis.Math,
    URL: globalThis.URL,
    URLSearchParams: globalThis.URLSearchParams,
    Headers: globalThis.Headers,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
    Request: globalThis.Request,

    // image-preview uses these
    Blob: globalThis.Blob,
    ClipboardItem: globalThis.ClipboardItem,

    // fixme: use our own db api
    indexedDB: globalThis.indexedDB,
    IDBRequest: globalThis.IDBRequest,
    IDBDatabase: globalThis.IDBDatabase,
    IDBCursorWithValue: globalThis.IDBCursorWithValue,
    IDBFactory: globalThis.IDBFactory,
    IDBKeyRange: globalThis.IDBKeyRange,
    IDBOpenDBRequest: globalThis.IDBOpenDBRequest,
    IDBTransaction: globalThis.IDBTransaction,
    IDBObjectStore: globalThis.IDBObjectStore,
    IDBIndex: globalThis.IDBIndex,
    IDBCursor: globalThis.IDBCursor,
    IDBVersionChangeEvent: globalThis.IDBVersionChangeEvent,
  });
};
