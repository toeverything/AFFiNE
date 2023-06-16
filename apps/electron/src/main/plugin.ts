import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';

import { logger } from '@affine/electron/main/logger';
import { AsyncCall } from 'async-call-rpc';
import { ipcMain } from 'electron';

import { MessageEventChannel } from './utils';

declare global {
  // fixme(himself65):
  //  remove this when bookmark block plugin is migrated to plugin-infra
  // eslint-disable-next-line no-var
  var asyncCall: Record<string, (...args: any) => PromiseLike<any>>;
}

export function registerPlugin() {
  const pluginWorkerPath = join(__dirname, './workers/plugin.worker.js');
  const asyncCall = AsyncCall<
    Record<string, (...args: any) => PromiseLike<any>>
  >(
    {
      log: (...args: any[]) => {
        logger.log('Plugin Worker', ...args);
      },
    },
    {
      channel: new MessageEventChannel(new Worker(pluginWorkerPath)),
    }
  );
  globalThis.asyncCall = asyncCall;
  logger.info('import plugin manager');
  import('@toeverything/plugin-infra/manager')
    .then(({ rootStore, affinePluginsAtom }) => {
      logger.info('import plugin manager');
      const bookmarkPluginPath = join(
        process.env.PLUGIN_DIR ?? resolve(__dirname, './plugins'),
        './bookmark-block/index.mjs'
      );
      logger.info('bookmark plugin path:', bookmarkPluginPath);
      import('file://' + bookmarkPluginPath);
      let dispose: () => void = () => {
        // noop
      };
      rootStore.sub(affinePluginsAtom, () => {
        dispose();
        const plugins = rootStore.get(affinePluginsAtom);
        Object.values(plugins).forEach(plugin => {
          logger.info('register plugin', plugin.definition.id);
          plugin.definition.commands.forEach(command => {
            logger.info('register plugin command', command);
            ipcMain.handle(command, (event, ...args) =>
              asyncCall[command](...args)
            );
          });
        });
        dispose = () => {
          Object.values(plugins).forEach(plugin => {
            plugin.definition.commands.forEach(command => {
              logger.info('unregister plugin command', command);
              ipcMain.removeHandler(command);
            });
          });
        };
      });
    })
    .catch(error => {
      logger.error('import plugin manager error', error);
    });
}
