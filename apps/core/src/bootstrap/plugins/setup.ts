import * as AFFiNEComponent from '@affine/component';
import { DebugLogger } from '@affine/debug';
import type { CallbackMap, PluginContext } from '@affine/sdk/entry';
import { FormatQuickBar } from '@blocksuite/blocks';
import * as BlockSuiteBlocksStd from '@blocksuite/blocks/std';
import * as BlockSuiteGlobalUtils from '@blocksuite/global/utils';
import { assertExists } from '@blocksuite/global/utils';
import { DisposableGroup } from '@blocksuite/global/utils';
import * as Icons from '@blocksuite/icons';
import {
  contentLayoutAtom,
  currentPageAtom,
  currentWorkspaceAtom,
  editorItemsAtom,
  headerItemsAtom,
  rootStore,
  settingItemsAtom,
  windowItemsAtom,
} from '@toeverything/infra/atom';
import * as Jotai from 'jotai/index';
import { Provider } from 'jotai/react';
import * as JotaiUtils from 'jotai/utils';
import * as React from 'react';
import { createElement, type PropsWithChildren } from 'react';
import * as ReactJSXRuntime from 'react/jsx-runtime';
import * as ReactDom from 'react-dom';
import * as ReactDomClient from 'react-dom/client';
import * as SWR from 'swr';

import { createFetch } from './endowments/fercher';
import { createTimers } from './endowments/timer';

const dynamicImportKey = '$h‍_import';

const permissionLogger = new DebugLogger('plugins:permission');
const importLogger = new DebugLogger('plugins:import');

const setupRootImportsMap = () => {
  _rootImportsMap.set('react', new Map(Object.entries(React)));
  _rootImportsMap.set(
    'react/jsx-runtime',
    new Map(Object.entries(ReactJSXRuntime))
  );
  _rootImportsMap.set('react-dom', new Map(Object.entries(ReactDom)));
  _rootImportsMap.set(
    'react-dom/client',
    new Map(Object.entries(ReactDomClient))
  );
  _rootImportsMap.set('@blocksuite/icons', new Map(Object.entries(Icons)));
  _rootImportsMap.set(
    '@affine/component',
    new Map(Object.entries(AFFiNEComponent))
  );
  _rootImportsMap.set(
    '@blocksuite/blocks/std',
    new Map(Object.entries(BlockSuiteBlocksStd))
  );
  _rootImportsMap.set(
    '@blocksuite/global/utils',
    new Map(Object.entries(BlockSuiteGlobalUtils))
  );
  _rootImportsMap.set('jotai', new Map(Object.entries(Jotai)));
  _rootImportsMap.set('jotai/utils', new Map(Object.entries(JotaiUtils)));
  _rootImportsMap.set(
    '@affine/sdk/entry',
    new Map(
      Object.entries({
        rootStore: rootStore,
        currentWorkspaceAtom: currentWorkspaceAtom,
        currentPageAtom: currentPageAtom,
        contentLayoutAtom: contentLayoutAtom,
      })
    )
  );
  _rootImportsMap.set('swr', new Map(Object.entries(SWR)));
};

// module -> importName -> updater[]
export const _rootImportsMap = new Map<string, Map<string, any>>();
setupRootImportsMap();
// pluginName -> module -> importName -> updater[]
export const _pluginNestedImportsMap = new Map<
  string,
  Map<string, Map<string, any>>
>();

const pluginImportsFunctionMap = new Map<string, (imports: any) => void>();
export const createImports = (pluginName: string) => {
  if (pluginImportsFunctionMap.has(pluginName)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return pluginImportsFunctionMap.get(pluginName)!;
  }
  const imports = (
    newUpdaters: [string, [string, ((val: any) => void)[]][]][]
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const currentImportMap = _pluginNestedImportsMap.get(pluginName)!;
    importLogger.debug('currentImportMap', pluginName, currentImportMap);

    for (const [module, moduleUpdaters] of newUpdaters) {
      importLogger.debug('imports module', module, moduleUpdaters);
      let moduleImports = _rootImportsMap.get(module);
      if (!moduleImports) {
        moduleImports = currentImportMap.get(module);
      }
      if (moduleImports) {
        for (const [importName, importUpdaters] of moduleUpdaters) {
          const updateImport = (value: any) => {
            for (const importUpdater of importUpdaters) {
              importUpdater(value);
            }
          };
          if (moduleImports.has(importName)) {
            const val = moduleImports.get(importName);
            updateImport(val);
          }
        }
      } else {
        console.error(
          'cannot find module in plugin import map',
          module,
          currentImportMap,
          _pluginNestedImportsMap
        );
      }
    }
  };
  pluginImportsFunctionMap.set(pluginName, imports);
  return imports;
};

const abortController = new AbortController();

const pluginFetch = createFetch({});
const timer = createTimers(abortController.signal);

const sharedGlobalThis = Object.assign(Object.create(null), timer, {
  fetch: pluginFetch,
});

const dynamicImportMap = new Map<
  string,
  (moduleName: string) => Promise<any>
>();

export const createOrGetDynamicImport = (
  baseUrl: string,
  pluginName: string
) => {
  if (dynamicImportMap.has(pluginName)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return dynamicImportMap.get(pluginName)!;
  }
  const dynamicImport = async (moduleName: string): Promise<any> => {
    const codeUrl = `${baseUrl}/${moduleName}`;
    const analysisUrl = `${baseUrl}/${moduleName}.json`;
    const response = await fetch(codeUrl);
    const analysisResponse = await fetch(analysisUrl);
    const analysis = await analysisResponse.json();
    const exports = analysis.exports as string[];
    const code = await response.text();
    const moduleCompartment = new Compartment(
      createOrGetGlobalThis(
        pluginName,
        // use singleton here to avoid infinite loop
        createOrGetDynamicImport(pluginName, baseUrl)
      )
    );
    const entryPoint = moduleCompartment.evaluate(code, {
      __evadeHtmlCommentTest__: true,
    });
    const moduleExports = {} as Record<string, any>;
    const setVarProxy = new Proxy(
      {},
      {
        get(_, p: string): any {
          return (newValue: any) => {
            moduleExports[p] = newValue;
          };
        },
      }
    );
    entryPoint({
      imports: createImports(pluginName),
      liveVar: setVarProxy,
      onceVar: setVarProxy,
    });
    importLogger.debug('import', moduleName, exports, moduleExports);
    return moduleExports;
  };
  dynamicImportMap.set(pluginName, dynamicImport);
  return dynamicImport;
};

const globalThisMap = new Map<string, any>();

export const createOrGetGlobalThis = (
  pluginName: string,
  dynamicImport: (moduleName: string) => Promise<any>
) => {
  if (globalThisMap.has(pluginName)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return globalThisMap.get(pluginName)!;
  }
  const pluginGlobalThis = Object.assign(
    Object.create(null),
    sharedGlobalThis,
    {
      process: Object.freeze({
        env: {
          NODE_ENV: process.env.NODE_ENV,
        },
      }),
      // dynamic import function
      [dynamicImportKey]: dynamicImport,
      // UNSAFE: React will read `window` and `document`
      window: new Proxy(
        {},
        {
          get(_, key) {
            permissionLogger.debug(`${pluginName} is accessing window`, key);
            if (sharedGlobalThis[key]) return sharedGlobalThis[key];
            const result = Reflect.get(window, key);
            if (typeof result === 'function') {
              return function (...args: any[]) {
                permissionLogger.debug(
                  `${pluginName} is calling window`,
                  key,
                  args
                );
                return result.apply(window, args);
              };
            }
            permissionLogger.debug('window', key, result);
            return result;
          },
        }
      ),
      document: new Proxy(
        {},
        {
          get(_, key) {
            permissionLogger.debug(`${pluginName} is accessing document`, key);
            if (sharedGlobalThis[key]) return sharedGlobalThis[key];
            const result = Reflect.get(document, key);
            if (typeof result === 'function') {
              return function (...args: any[]) {
                permissionLogger.debug(
                  `${pluginName} is calling window`,
                  key,
                  args
                );
                return result.apply(document, args);
              };
            }
            permissionLogger.debug('document', key, result);
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
    }
  );
  globalThisMap.set(pluginName, pluginGlobalThis);
  return pluginGlobalThis;
};

export const setupPluginCode = async (
  baseUrl: string,
  pluginName: string,
  filename: string
) => {
  if (!_pluginNestedImportsMap.has(pluginName)) {
    _pluginNestedImportsMap.set(pluginName, new Map());
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const currentImportMap = _pluginNestedImportsMap.get(pluginName)!;
  const isMissingPackage = (name: string) =>
    _rootImportsMap.has(name) && !currentImportMap.has(name);

  const bundleAnalysis = await fetch(`${baseUrl}/${filename}.json`).then(res =>
    res.json()
  );
  const moduleExports = bundleAnalysis.exports as Record<string, [string]>;
  const moduleImports = bundleAnalysis.imports as string[];
  const moduleReexports = bundleAnalysis.reexports as Record<
    string,
    [localName: string, exportedName: string][]
  >;
  await Promise.all(
    moduleImports.map(name => {
      if (isMissingPackage(name)) {
        return Promise.resolve();
      } else {
        importLogger.debug('missing package', name);
        return setupPluginCode(baseUrl, pluginName, name);
      }
    })
  );
  const code = await fetch(`${baseUrl}/${filename.replace(/^\.\//, '')}`).then(
    res => res.text()
  );
  importLogger.debug('evaluating', filename);
  const moduleCompartment = new Compartment(
    createOrGetGlobalThis(
      pluginName,
      // use singleton here to avoid infinite loop
      createOrGetDynamicImport(baseUrl, pluginName)
    )
  );
  const entryPoint = moduleCompartment.evaluate(code, {
    __evadeHtmlCommentTest__: true,
  });
  const moduleExportsMap = new Map<string, any>();
  const setVarProxy = new Proxy(
    {},
    {
      get(_, p: string): any {
        return (newValue: any) => {
          moduleExportsMap.set(p, newValue);
        };
      },
    }
  );
  currentImportMap.set(filename, moduleExportsMap);
  entryPoint({
    imports: createImports(pluginName),
    liveVar: setVarProxy,
    onceVar: setVarProxy,
  });

  for (const [newExport, [originalExport]] of Object.entries(moduleExports)) {
    if (newExport === originalExport) continue;
    const value = moduleExportsMap.get(originalExport);
    moduleExportsMap.set(newExport, value);
    moduleExportsMap.delete(originalExport);
  }

  for (const [name, reexports] of Object.entries(moduleReexports)) {
    const targetExports = currentImportMap.get(filename);
    const moduleExports = currentImportMap.get(name);
    assertExists(targetExports);
    assertExists(moduleExports);
    for (const [exportedName, localName] of reexports) {
      const exportedValue: any = moduleExports.get(exportedName);
      assertExists(exportedValue);
      targetExports.set(localName, exportedValue);
    }
  }
};

const PluginProvider = ({ children }: PropsWithChildren) =>
  createElement(
    Provider,
    {
      store: rootStore,
    },
    children
  );

const group = new DisposableGroup();
const entryLogger = new DebugLogger('plugin:entry');

export const evaluatePluginEntry = (pluginName: string) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const currentImportMap = _pluginNestedImportsMap.get(pluginName)!;
  const pluginExports = currentImportMap.get('index.js');
  assertExists(pluginExports);
  const entryFunction = pluginExports.get('entry');
  const cleanup = entryFunction(<PluginContext>{
    register: (part, callback) => {
      entryLogger.info(`Registering ${pluginName} to ${part}`);
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
          (callback as CallbackMap['formatBar'])(div, page, getBlockRange);
          return div;
        });
      } else {
        throw new Error(`Unknown part: ${part}`);
      }
    },
    utils: {
      PluginProvider,
    },
  });
  if (typeof cleanup !== 'function') {
    throw new Error('Plugin entry must return a function');
  }
  group.add(cleanup);
};
