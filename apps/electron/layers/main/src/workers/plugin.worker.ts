import { join } from 'node:path';
import { parentPort } from 'node:worker_threads';

import { AsyncCall } from 'async-call-rpc';

import { MessagePortChannel } from '../utils';

const commandProxy: Record<string, (...args: any[]) => Promise<any>> = {};

if (!parentPort) {
  throw new Error('parentPort is undefined');
}

AsyncCall(commandProxy, {
  channel: new MessagePortChannel(parentPort),
});

import('@toeverything/plugin-infra/manager').then(
  ({ rootStore, affinePluginsAtom }) => {
    const bookmarkPluginPath = join(
      process.env.PLUGIN_DIR ?? '../../../plugins',
      './bookmark-block/index.mjs'
    );

    import(bookmarkPluginPath);
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
  }
);
