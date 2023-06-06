import { join } from 'node:path';
import type { MessagePort } from 'node:worker_threads';
import { parentPort } from 'node:worker_threads';

import type { EventBasedChannel } from 'async-call-rpc';
import { AsyncCall } from 'async-call-rpc';

class MessagePortChannel implements EventBasedChannel {
  constructor(private port: MessagePort) {}

  on(listener: (data: unknown) => void) {
    this.port.addListener('message', listener);
    return () => {
      this.port.removeListener('message', listener);
    };
  }

  send(data: unknown) {
    this.port.postMessage(data);
  }
}

const commandProxy: Record<string, (...args: any[]) => Promise<any>> = {};

AsyncCall(commandProxy, {
  channel: new MessagePortChannel(parentPort!),
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
