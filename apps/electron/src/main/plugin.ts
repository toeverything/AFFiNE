import { join, resolve } from 'node:path';

import { logger } from '@affine/electron/main/logger';
import { ipcMain } from 'electron';

declare global {
  // fixme(himself65):
  //  remove this when bookmark block plugin is migrated to plugin-infra
  // eslint-disable-next-line no-var
  var asyncCall: Record<string, (...args: any) => PromiseLike<any>>;
}

export function registerPlugin() {
  logger.info('import plugin manager');
  globalThis.asyncCall = {};
  const bookmarkPluginPath = join(
    process.env.PLUGIN_DIR ?? resolve(__dirname, './plugins'),
    './bookmark/index.js'
  );
  logger.info('bookmark plugin path:', bookmarkPluginPath);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { entry } = require(bookmarkPluginPath);

  entry({
    registerCommand: (command: string, handler: (...args: any[]) => any) => {
      logger.info('register plugin command', command);
      ipcMain.handle(command, (event, ...args) => handler(...args));
      globalThis.asyncCall[command] = handler;
    },
    registerCommands: (command: string) => {
      ipcMain.removeHandler(command);
      delete globalThis.asyncCall[command];
    },
  });
}
