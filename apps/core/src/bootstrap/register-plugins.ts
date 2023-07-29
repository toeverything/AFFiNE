/// <reference types="@types/webpack-env" />
import 'ses';

import * as AFFiNEComponent from '@affine/component';
import { DebugLogger } from '@affine/debug';
import { FormatQuickBar } from '@blocksuite/blocks';
import * as BlockSuiteBlocksStd from '@blocksuite/blocks/std';
import { DisposableGroup } from '@blocksuite/global/utils';
import * as BlockSuiteGlobalUtils from '@blocksuite/global/utils';
import * as Icons from '@blocksuite/icons';
import * as Atom from '@toeverything/plugin-infra/atom';
import {
  editorItemsAtom,
  headerItemsAtom,
  registeredPluginAtom,
  rootStore,
  settingItemsAtom,
  windowItemsAtom,
} from '@toeverything/plugin-infra/atom';
import type {
  CallbackMap,
  PluginContext,
} from '@toeverything/plugin-infra/entry';
import * as Jotai from 'jotai';
import { Provider } from 'jotai/react';
import * as JotaiUtils from 'jotai/utils';
import type { PropsWithChildren } from 'react';
import * as React from 'react';
import * as ReactJSXRuntime from 'react/jsx-runtime';
import * as ReactDom from 'react-dom';
import * as ReactDomClient from 'react-dom/client';

if (!process.env.COVERAGE) {
  lockdown({
    evalTaming: 'unsafeEval',
    overrideTaming: 'severe',
    consoleTaming: 'unsafe',
    errorTaming: 'unsafe',
    errorTrapping: 'platform',
    unhandledRejectionTrapping: 'report',
  });
}

const builtinPluginUrl = new Set([
  '/plugins/bookmark',
  '/plugins/copilot',
  '/plugins/hello-world',
]);

const logger = new DebugLogger('register-plugins');

const PluginProvider = ({ children }: PropsWithChildren) =>
  React.createElement(
    Provider,
    {
      store: rootStore,
    },
    children
  );

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

const createGlobalThis = () => {
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

const group = new DisposableGroup();

declare global {
  // eslint-disable-next-line no-var
  var __pluginPackageJson__: unknown[];
}

globalThis.__pluginPackageJson__ = [];

interface PluginLoadedEvent extends CustomEvent<{ plugins: unknown[] }> {}
// add to window
declare global {
  interface WindowEventMap {
    'plugin-loaded': PluginLoadedEvent;
  }
}

await Promise.all(
  [...builtinPluginUrl].map(url => {
    return fetch(`${url}/package.json`)
      .then(async res => {
        const packageJson = await res.json();
        const {
          name: pluginName,
          affinePlugin: {
            release,
            entry: { core },
            assets,
          },
        } = packageJson;
        globalThis.__pluginPackageJson__.push(packageJson);
        logger.debug(`registering plugin ${pluginName}`);
        logger.debug(`package.json: ${packageJson}`);
        if (!release) {
          return Promise.resolve();
        }
        const pluginCompartment = new Compartment(createGlobalThis(), {});
        const pluginGlobalThis = pluginCompartment.globalThis;
        const baseURL = url;
        const entryURL = `${baseURL}/${core}`;
        rootStore.set(registeredPluginAtom, prev => [...prev, pluginName]);
        await fetch(entryURL).then(async res => {
          if (assets.length > 0) {
            await Promise.all(
              assets.map(async (asset: string) => {
                if (asset.endsWith('.css')) {
                  const res = await fetch(`${baseURL}/${asset}`);
                  if (res.ok) {
                    // todo: how to put css file into sandbox?
                    return res.text().then(text => {
                      const style = document.createElement('style');
                      style.setAttribute('plugin-id', pluginName);
                      style.textContent = text;
                      document.head.appendChild(style);
                    });
                  }
                  return null;
                } else {
                  return Promise.resolve();
                }
              })
            );
          }
          const codeText = await res.text();
          pluginCompartment.evaluate(codeText, {
            __evadeHtmlCommentTest__: true,
          });
          pluginGlobalThis.__INTERNAL__ENTRY = {
            register: (part, callback) => {
              logger.info(`Registering ${pluginName} to ${part}`);
              if (part === 'headerItem') {
                rootStore.set(headerItemsAtom, items => ({
                  ...items,
                  [pluginName]: callback as CallbackMap['headerItem'],
                }));
              } else if (part === 'editor') {
                rootStore.set(editorItemsAtom, items => ({
                  ...items,
                  [pluginName]: callback as CallbackMap['editor'],
                }));
              } else if (part === 'window') {
                rootStore.set(windowItemsAtom, items => ({
                  ...items,
                  [pluginName]: callback as CallbackMap['window'],
                }));
              } else if (part === 'setting') {
                rootStore.set(settingItemsAtom, items => ({
                  ...items,
                  [pluginName]: callback as CallbackMap['setting'],
                }));
              } else if (part === 'formatBar') {
                FormatQuickBar.customElements.push((page, getBlockRange) => {
                  const div = document.createElement('div');
                  (callback as CallbackMap['formatBar'])(
                    div,
                    page,
                    getBlockRange
                  );
                  return div;
                });
              } else {
                throw new Error(`Unknown part: ${part}`);
              }
            },
            utils: {
              PluginProvider,
            },
          } satisfies PluginContext;
          const dispose = pluginCompartment.evaluate(
            'exports.entry(__INTERNAL__ENTRY)'
          );
          if (typeof dispose !== 'function') {
            throw new Error('Plugin entry must return a function');
          }
          pluginGlobalThis.__INTERNAL__ENTRY = undefined;
          group.add(dispose);
        });
      })
      .catch(e => {
        console.error(`error when fetch plugin from ${url}`, e);
      });
  })
).then(() => {
  console.info('All plugins loaded');
});
