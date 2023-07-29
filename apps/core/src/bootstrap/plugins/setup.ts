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

const customRequire = (id: string) => {
  if (id === '@toeverything/plugin-infra/atom') {
    return Atom;
  }
  if (id === 'react') {
    return React;
  }
  if (id === 'react/jsx-runtime') {
    return ReactJSXRuntime;
  }
  if (id === 'react-dom') {
    return ReactDom;
  }
  if (id === 'react-dom/client') {
    return ReactDomClient;
  }
  if (id === '@blocksuite/icons') {
    return Icons;
  }
  if (id === '@affine/component') {
    return AFFiNEComponent;
  }
  if (id === '@blocksuite/blocks/std') {
    return BlockSuiteBlocksStd;
  }
  if (id === '@blocksuite/global/utils') {
    return BlockSuiteGlobalUtils;
  }
  if (id === 'jotai') {
    return Jotai;
  }
  if (id === 'jotai/utils') {
    return JotaiUtils;
  }
  throw new Error(`Cannot find module '${id}'`);
};

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
    // copilot uses these
    crypto: globalThis.crypto,
    CustomEvent: globalThis.CustomEvent,
    Date: globalThis.Date,
    Math: globalThis.Math,
    URL: globalThis.URL,
    URLSearchParams: globalThis.URLSearchParams,
    Headers: globalThis.Headers,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
    Request: globalThis.Request,
    Error: globalThis.Error,
    // bookmark uses these
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

    exports: {},
    console: globalThis.console,
    require: customRequire,
  };
};
