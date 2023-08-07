import { DebugLogger } from '@affine/debug';
import {
  builtinPluginPaths,
  enabledPluginAtom,
  invokeCleanup,
  pluginPackageJson,
} from '@toeverything/infra/__internal__/plugin';
import { loadedPluginNameAtom, rootStore } from '@toeverything/infra/atom';
import { packageJsonOutputSchema } from '@toeverything/infra/type';
import type { z } from 'zod';

import { evaluatePluginEntry, setupPluginCode } from './plugins/setup';

const logger = new DebugLogger('register-plugins');

declare global {
  // eslint-disable-next-line no-var
  var __pluginPackageJson__: unknown[];
}

Object.defineProperty(globalThis, '__pluginPackageJson__', {
  get() {
    return rootStore.get(pluginPackageJson);
  },
});

rootStore.sub(enabledPluginAtom, () => {
  const added = new Set<string>();
  const removed = new Set<string>();
  const enabledPlugin = new Set(rootStore.get(enabledPluginAtom));
  enabledPlugin.forEach(pluginName => {
    if (!enabledPluginSet.has(pluginName)) {
      added.add(pluginName);
    }
  });
  enabledPluginSet.forEach(pluginName => {
    if (!enabledPlugin.has(pluginName)) {
      removed.add(pluginName);
    }
  });
  // update plugins
  enabledPluginSet.clear();
  enabledPlugin.forEach(pluginName => {
    enabledPluginSet.add(pluginName);
  });
  added.forEach(pluginName => {
    evaluatePluginEntry(pluginName);
  });
  removed.forEach(pluginName => {
    invokeCleanup(pluginName);
  });
});
const enabledPluginSet = new Set(rootStore.get(enabledPluginAtom));
const loadedAssets = new Set<string>();

// we will load all plugins in parallel from builtinPlugins
export const pluginRegisterPromise = Promise.all(
  [...builtinPluginPaths].map(url => {
    return fetch(`${url}/package.json`)
      .then(async res => {
        const packageJson = (await res.json()) as z.infer<
          typeof packageJsonOutputSchema
        >;
        packageJsonOutputSchema.parse(packageJson);
        const {
          name: pluginName,
          affinePlugin: {
            release,
            entry: { core },
            assets,
          },
        } = packageJson;
        rootStore.set(pluginPackageJson, json => [...json, packageJson]);
        logger.debug(`registering plugin ${pluginName}`);
        logger.debug(`package.json: ${packageJson}`);
        if (!release && !runtimeConfig.enablePlugin) {
          return Promise.resolve();
        }
        const baseURL = url;
        const entryURL = `${baseURL}/${core}`;
        rootStore.set(loadedPluginNameAtom, prev => [...prev, pluginName]);
        await setupPluginCode(baseURL, pluginName, core);
        console.log(`prepareImports for ${pluginName} done`);
        await fetch(entryURL).then(async () => {
          if (assets.length > 0) {
            await Promise.all(
              assets.map(async (asset: string) => {
                // todo(himself65): add assets into shadow dom
                if (loadedAssets.has(asset)) {
                  return Promise.resolve();
                }
                if (asset.endsWith('.css')) {
                  loadedAssets.add(asset);
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
          if (!enabledPluginSet.has(pluginName)) {
            logger.debug(`plugin ${pluginName} is not enabled`);
          } else {
            logger.debug(`plugin ${pluginName} is enabled`);
            evaluatePluginEntry(pluginName);
          }
        });
      })
      .catch(e => {
        console.error(`error when fetch plugin from ${url}`, e);
      });
  })
).then(() => {
  console.info('All plugins loaded');
});
