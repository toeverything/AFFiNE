import { DebugLogger } from '@affine/debug';
import {
  registeredPluginAtom,
  rootStore,
} from '@toeverything/plugin-infra/atom';

import { evaluatePluginEntry, setupPluginCode } from './plugins/setup';

const builtinPluginUrl = new Set([
  '/plugins/bookmark',
  '/plugins/copilot',
  '/plugins/hello-world',
  '/plugins/image-preview',
]);

const logger = new DebugLogger('register-plugins');

declare global {
  // eslint-disable-next-line no-var
  var __pluginPackageJson__: unknown[];
}

globalThis.__pluginPackageJson__ = [];

Promise.all(
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
        const baseURL = url;
        const entryURL = `${baseURL}/${core}`;
        rootStore.set(registeredPluginAtom, prev => [...prev, pluginName]);
        await setupPluginCode(baseURL, pluginName, core);
        console.log(`prepareImports for ${pluginName} done`);
        await fetch(entryURL).then(async () => {
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
          evaluatePluginEntry(pluginName);
        });
      })
      .catch(e => {
        console.error(`error when fetch plugin from ${url}`, e);
      });
  })
).then(() => {
  console.info('All plugins loaded');
});
