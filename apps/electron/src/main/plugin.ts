import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';

import { logger, pluginLogger } from '@affine/electron/main/logger';
import { AsyncCall } from 'async-call-rpc';
import { ipcMain } from 'electron';
import { readFile } from 'fs/promises';

import { MessageEventChannel } from '../shared/utils';

const builtInPlugins = ['bookmark'];

declare global {
  // fixme(himself65):
  //  remove this when bookmark block plugin is migrated to plugin-infra
  // eslint-disable-next-line no-var
  var asyncCall: Record<string, (...args: any) => PromiseLike<any>>;
}

export async function registerPlugin() {
  logger.info('import plugin manager');
  const asyncCall = AsyncCall<
    Record<string, (...args: any) => PromiseLike<any>>
  >(
    {
      log: (...args: any[]) => {
        pluginLogger.log(...args);
      },
    },
    {
      channel: new MessageEventChannel(
        new Worker(resolve(__dirname, './worker.js'), {})
      ),
    }
  );
  globalThis.asyncCall = asyncCall;
  await Promise.all(
    builtInPlugins.map(async plugin => {
      const pluginPackageJsonPath = join(
        process.env.PLUGIN_DIR ?? resolve(__dirname, './plugins'),
        `./${plugin}/package.json`
      );
      logger.info(`${plugin} plugin path:`, pluginPackageJsonPath);
      const packageJson = JSON.parse(
        await readFile(pluginPackageJsonPath, 'utf-8')
      );
      console.log('packageJson', packageJson);
      const serverCommand: string[] = packageJson.affinePlugin.serverCommand;
      serverCommand.forEach(command => {
        ipcMain.handle(command, async (_, ...args) => {
          logger.info(`plugin ${plugin} called`);
          return asyncCall[command](...args);
        });
      });
    })
  );
}
