import * as AFFiNEComponent from '@affine/component';
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

export const createGlobalThis = () => {
  return {
    process: Object.freeze({
      env: {
        NODE_ENV: process.env.NODE_ENV,
      },
    }),
    // UNSAFE: React will read `window` and `document`
    window,
    document,
    navigator,
    userAgent: navigator.userAgent,
    // todo(himself65): permission control
    fetch: function (input: RequestInfo, init?: RequestInit) {
      return globalThis.fetch(input, init);
    },
    setTimeout: function (callback: () => void, timeout: number) {
      return globalThis.setTimeout(callback, timeout);
    },
    clearTimeout: function (id: number) {
      return globalThis.clearTimeout(id);
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
  };
};
