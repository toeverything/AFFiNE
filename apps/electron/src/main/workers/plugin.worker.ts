import { join, resolve } from 'node:path';
import { parentPort } from 'node:worker_threads';

import { AsyncCall } from 'async-call-rpc';

import { MessageEventChannel } from '../utils';

const commandProxy: Record<string, (...args: any[]) => Promise<any>> = {};

if (!parentPort) {
  throw new Error('parentPort is undefined');
}

const mainThread = AsyncCall<{
  log: (...args: any[]) => Promise<void>;
}>(commandProxy, {
  channel: new MessageEventChannel(parentPort),
});

globalThis.console.log = mainThread.log;
globalThis.console.error = mainThread.log;
globalThis.console.info = mainThread.log;
globalThis.console.debug = mainThread.log;
globalThis.console.warn = mainThread.log;

console.log('import plugin infra');

import('@toeverything/plugin-infra/manager')
  .then(({ rootStore, affinePluginsAtom }) => {
    const bookmarkPluginPath = join(
      process.env.PLUGIN_DIR ?? resolve(__dirname, '../plugins'),
      './bookmark-block/index.mjs'
    );

    console.log('import bookmark plugin', bookmarkPluginPath);

    import('file://' + bookmarkPluginPath).catch(console.log);
    rootStore.sub(affinePluginsAtom, () => {
      const plugins = rootStore.get(affinePluginsAtom);
      Object.values(plugins).forEach(plugin => {
        console.log('handle plugin', plugin.definition.id);
        if (plugin.serverAdapter) {
          try {
            plugin.serverAdapter({
              registerCommand: (command, fn) => {
                console.log('register command', command);
                commandProxy[command] = fn;
              },
              unregisterCommand: command => {
                console.log('unregister command', command);
                delete commandProxy[command];
              },
            });
          } catch (e) {
            console.log(
              'error when handle plugin',
              plugin.definition.id,
              `${e}`
            );
          }
        } else {
          console.log('no server adapter, skipping.');
        }
      });
    });
  })
  .catch(err => {
    console.error(err);
  });
