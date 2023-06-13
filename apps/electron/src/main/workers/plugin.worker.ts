import { join, resolve } from 'node:path';
import { parentPort } from 'node:worker_threads';

import { AsyncCall } from 'async-call-rpc';

import { MessageEventChannel } from '../utils';

const commandProxy: Record<string, (...args: any[]) => Promise<any>> = {};

if (!parentPort) {
  throw new Error('parentPort is undefined');
}

AsyncCall(commandProxy, {
  channel: new MessageEventChannel(parentPort),
});

import('@toeverything/plugin-infra/manager')
  .then(({ rootStore, affinePluginsAtom }) => {
    const bookmarkPluginPath = join(
      process.env.PLUGIN_DIR ?? resolve(__dirname, '../plugins'),
      './bookmark-block/index.mjs'
    );

    import('file://' + bookmarkPluginPath);
    rootStore.sub(affinePluginsAtom, () => {
      const plugins = rootStore.get(affinePluginsAtom);
      Object.values(plugins).forEach(plugin => {
        if (plugin.serverAdapter) {
          plugin.serverAdapter({
            registerCommand: (command, fn) => {
              console.log('register command', command);
              commandProxy[command] = fn;
            },
            unregisterCommand: command => {
              delete commandProxy[command];
            },
          });
        }
      });
    });
  })
  .catch(err => {
    console.error(err);
  });
