import { join, resolve } from 'node:path';
import { parentPort } from 'node:worker_threads';

import type { ServerContext } from '@toeverything/plugin-infra/server';
import { AsyncCall } from 'async-call-rpc';

import { MessageEventChannel } from '../shared/utils';

if (!parentPort) {
  throw new Error('parentPort is null');
}
const commandProxy: Record<string, (...args: any[]) => Promise<any>> = {};

parentPort.start();

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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bookmarkPluginModule = require(join(
  process.env.PLUGIN_DIR ?? resolve(__dirname, './plugins'),
  './bookmark/index.cjs'
));

const serverContext: ServerContext = {
  registerCommand: (command, fn) => {
    console.log('register command', command);
    commandProxy[command] = fn;
  },
  unregisterCommand: command => {
    console.log('unregister command', command);
    delete commandProxy[command];
  },
};

bookmarkPluginModule.entry(serverContext);
