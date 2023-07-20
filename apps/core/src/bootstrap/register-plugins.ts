/// <reference types="@types/webpack-env" />
import 'ses';

import * as AFFiNEComponent from '@affine/component';
import * as BlockSuiteBlocksStd from '@blocksuite/blocks/std';
import { DisposableGroup } from '@blocksuite/global/utils';
import * as BlockSuiteGlobalUtils from '@blocksuite/global/utils';
import * as Icons from '@blocksuite/icons';
import type {
  CallbackMap,
  PluginContext,
} from '@toeverything/plugin-infra/entry';
import * as Manager from '@toeverything/plugin-infra/manager';
import {
  editorItemsAtom,
  headerItemsAtom,
  registeredPluginAtom,
  rootStore,
  windowItemsAtom,
} from '@toeverything/plugin-infra/manager';
import * as Jotai from 'jotai';
import { Provider } from 'jotai/react';
import * as JotaiUtils from 'jotai/utils';
import type { PropsWithChildren } from 'react';
import * as React from 'react';
import * as ReactJSXRuntime from 'react/jsx-runtime';
import * as ReactDom from 'react-dom';
import * as ReactDomClient from 'react-dom/client';

const PluginProvider = ({ children }: PropsWithChildren) =>
  React.createElement(
    Provider,
    {
      store: rootStore,
    },
    children
  );

console.log('JotaiUtils', JotaiUtils);

const customRequire = (id: string) => {
  if (id === '@toeverything/plugin-infra/manager') {
    return harden(Manager);
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
    return harden(Icons);
  }
  if (id === '@affine/component') {
    return harden(AFFiNEComponent);
  }
  if (id === '@blocksuite/blocks/std') {
    return harden(BlockSuiteBlocksStd);
  }
  if (id === '@blocksuite/global/utils') {
    return harden(BlockSuiteGlobalUtils);
  }
  if (id === 'jotai') {
    return harden(Jotai);
  }
  if (id === 'jotai/utils') {
    return harden(JotaiUtils);
  }
  if (id === '../plugin.js') {
    return entryCompartment.evaluate('exports');
  }
  throw new Error(`Cannot find module '${id}'`);
};

const createGlobalThis = () => {
  return {
    process: harden({
      env: {
        NODE_ENV: process.env.NODE_ENV,
      },
    }),
    // UNSAFE: React will read `window` and `document`
    window,
    document,
    navigator,
    userAgent: navigator.userAgent,

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
const pluginList = await (
  await fetch(new URL(`./plugins/plugin-list.json`, window.location.origin))
).json();
const builtInPlugins: string[] = pluginList.map((plugin: any) => plugin.name);
const pluginGlobalThis = createGlobalThis();
const pluginEntry = await fetch('/plugins/plugin.js').then(res => res.text());
const entryCompartment = new Compartment(pluginGlobalThis, {});
entryCompartment.evaluate(pluginEntry, {
  __evadeHtmlCommentTest__: true,
});
await Promise.all(
  builtInPlugins.map(plugin => {
    const pluginCompartment = new Compartment(createGlobalThis(), {});
    const pluginGlobalThis = pluginCompartment.globalThis;
    const baseURL = new URL(`./plugins/${plugin}/`, window.location.origin);
    const packageJsonURL = new URL('package.json', baseURL);
    return fetch(packageJsonURL).then(async res => {
      const packageJson = await res.json();
      const pluginConfig = packageJson['affinePlugin'];
      if (
        pluginConfig.release === false &&
        process.env.NODE_ENV !== 'development'
      ) {
        return;
      }
      rootStore.set(registeredPluginAtom, prev => [...prev, plugin]);
      const coreEntry = new URL(pluginConfig.entry.core, baseURL.toString());
      const codeText = await fetch(coreEntry).then(res => res.text());
      pluginCompartment.evaluate(codeText);
      pluginGlobalThis.__INTERNAL__ENTRY = {
        register: (part, callback) => {
          if (part === 'headerItem') {
            rootStore.set(headerItemsAtom, items => ({
              ...items,
              [plugin]: callback as CallbackMap['headerItem'],
            }));
          } else if (part === 'editor') {
            rootStore.set(editorItemsAtom, items => ({
              ...items,
              [plugin]: callback as CallbackMap['editor'],
            }));
          } else if (part === 'window') {
            rootStore.set(windowItemsAtom, items => ({
              ...items,
              [plugin]: callback as CallbackMap['window'],
            }));
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
);

console.log('register plugins finished');
