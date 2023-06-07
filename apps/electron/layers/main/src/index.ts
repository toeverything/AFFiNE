import './security-restrictions';

import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import type { EventBasedChannel } from 'async-call-rpc';
import { AsyncCall } from 'async-call-rpc';
import { app, ipcMain } from 'electron';

import { createApplicationMenu } from './application-menu/create';
import { registerEvents } from './events';
import { registerHandlers } from './handlers';
import { logger } from './logger';
import { restoreOrCreateWindow } from './main-window';
import { registerProtocol } from './protocol';
import { registerUpdater } from './updater';

if (require('electron-squirrel-startup')) app.quit();
// allow tests to overwrite app name through passing args
if (process.argv.includes('--app-name')) {
  const appNameIndex = process.argv.indexOf('--app-name');
  const appName = process.argv[appNameIndex + 1];
  app.setName(appName);
}

/**
 * Prevent multiple instances
 */
const isSingleInstance = app.requestSingleInstanceLock();
if (!isSingleInstance) {
  logger.info('Another instance is running, exiting...');
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  restoreOrCreateWindow();
});

app.on('open-url', async (_, _url) => {
  // todo: handle `affine://...` urls
});

/**
 * Shout down background process if all windows was closed
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * @see https://www.electronjs.org/docs/v14-x-y/api/app#event-activate-macos Event: 'activate'
 */
app.on('activate', restoreOrCreateWindow);

class ThreadWorkerChannel implements EventBasedChannel {
  constructor(private worker: Worker) {}

  on(listener: (data: unknown) => void) {
    this.worker.addListener('message', listener);
    return () => {
      this.worker.removeListener('message', listener);
    };
  }

  send(data: unknown) {
    this.worker.postMessage(data);
  }
}

const pluginWorkerPath = join(__dirname, './workers/plugin.worker.js');
const asyncCall = AsyncCall<Record<string, (...args: any) => PromiseLike<any>>>(
  {},
  {
    channel: new ThreadWorkerChannel(new Worker(pluginWorkerPath)),
  }
);

import('@toeverything/plugin-infra/manager').then(
  ({ rootStore, affinePluginsAtom }) => {
    const bookmarkPluginPath = join(
      process.env.PLUGIN_DIR ?? '../../plugins',
      './bookmark-block/index.mjs'
    );
    import(bookmarkPluginPath);
    let dispose: (() => void) | undefined;
    rootStore.sub(affinePluginsAtom, () => {
      if (dispose) {
        dispose();
        dispose = undefined;
      }
      const plugins = rootStore.get(affinePluginsAtom);
      Object.values(plugins).forEach(plugin => {
        plugin.definition.commands.forEach(command => {
          ipcMain.handle(command, (event, ...args) =>
            asyncCall[command](...args)
          );
        });
      });
      dispose = () => {
        Object.values(plugins).forEach(plugin => {
          plugin.definition.commands.forEach(command => {
            ipcMain.removeHandler(command);
          });
        });
      };
    });
  }
);
/**
 * Create app window when background process will be ready
 */
app
  .whenReady()
  .then(registerProtocol)
  .then(registerHandlers)
  .then(registerEvents)
  .then(restoreOrCreateWindow)
  .then(createApplicationMenu)
  .then(registerUpdater)
  .catch(e => console.error('Failed create window:', e));
