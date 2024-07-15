import { ipcMain } from 'electron';

import { clipboardHandlers } from './clipboard';
import { configStorageHandlers } from './config-storage';
import { exportHandlers } from './export';
import { findInPageHandlers } from './find-in-page';
import { getLogFilePath, logger, revealLogFile } from './logger';
import { sharedStorageHandlers } from './shared-storage';
import { uiHandlers } from './ui/handlers';
import { updaterHandlers } from './updater';

export const debugHandlers = {
  revealLogFile: async () => {
    return revealLogFile();
  },
  logFilePath: async () => {
    return getLogFilePath();
  },
};

// Note: all of these handlers will be the single-source-of-truth for the apis exposed to the renderer process
export const allHandlers = {
  debug: debugHandlers,
  ui: uiHandlers,
  clipboard: clipboardHandlers,
  export: exportHandlers,
  updater: updaterHandlers,
  configStorage: configStorageHandlers,
  findInPage: findInPageHandlers,
  sharedStorage: sharedStorageHandlers,
};

export const registerHandlers = () => {
  // TODO(@Peng): listen to namespace instead of individual event types
  ipcMain.setMaxListeners(100);
  for (const [namespace, namespaceHandlers] of Object.entries(allHandlers)) {
    for (const [key, handler] of Object.entries(namespaceHandlers)) {
      const chan = `${namespace}:${key}`;
      const wrapper = async (
        e: Electron.IpcMainInvokeEvent,
        ...args: any[]
      ) => {
        const start = performance.now();
        try {
          const result = await handler(e, ...args);
          logger.info(
            '[ipc-api]',
            chan,
            args.filter(
              arg => typeof arg !== 'function' && typeof arg !== 'object'
            ),
            '-',
            (performance.now() - start).toFixed(2),
            'ms'
          );
          return result;
        } catch (error) {
          logger.error('[ipc]', chan, error);
        }
      };
      // for ipcRenderer.invoke
      ipcMain.handle(chan, wrapper);
      // for ipcRenderer.sendSync
      ipcMain.on(chan, (e, ...args) => {
        wrapper(e, ...args)
          .then(ret => {
            e.returnValue = ret;
          })
          .catch(() => {
            // never throw
          });
      });
    }
  }
};
