/// <reference types="@types/webpack-env" />
import 'ses';

import { DebugLogger } from '@affine/debug';
import { FormatQuickBar } from '@blocksuite/blocks';
import { DisposableGroup } from '@blocksuite/global/utils';
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
import { Provider } from 'jotai/react';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

import { createGlobalThis } from './plugins/setup';

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
  '/plugins/image-preview',
]);

const logger = new DebugLogger('register-plugins');

const PluginProvider = ({ children }: PropsWithChildren) =>
  createElement(
    Provider,
    {
      store: rootStore,
    },
    children
  );

const group = new DisposableGroup();

declare global {
  // eslint-disable-next-line no-var
  var __pluginPackageJson__: unknown[];
}

globalThis.__pluginPackageJson__ = [];

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
        if (!release && process.env.NODE_ENV === 'production') {
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
