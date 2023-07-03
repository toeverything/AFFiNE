import type {
  ClipboardHandlerManager,
  DebugHandlerManager,
  ExportHandlerManager,
  UIHandlerManager,
  UnwrapManagerHandlerToServerSide,
  UpdaterHandlerManager,
} from '@toeverything/infra';
import { ipcMain } from 'electron';

import { clipboardHandlers } from './clipboard';
import { exportHandlers } from './export';
import { getLogFilePath, logger, revealLogFile } from './logger';
import { uiHandlers } from './ui';
import { updaterHandlers } from './updater';

export const debugHandlers = {
  revealLogFile: async () => {
    return revealLogFile();
  },
  logFilePath: async () => {
    return getLogFilePath();
  },
};

type AllHandlers = {
  debug: UnwrapManagerHandlerToServerSide<
    Electron.IpcMainInvokeEvent,
    DebugHandlerManager
  >;
  clipboard: UnwrapManagerHandlerToServerSide<
    Electron.IpcMainInvokeEvent,
    ClipboardHandlerManager
  >;
  export: UnwrapManagerHandlerToServerSide<
    Electron.IpcMainInvokeEvent,
    ExportHandlerManager
  >;
  ui: UnwrapManagerHandlerToServerSide<
    Electron.IpcMainInvokeEvent,
    UIHandlerManager
  >;
  updater: UnwrapManagerHandlerToServerSide<
    Electron.IpcMainInvokeEvent,
    UpdaterHandlerManager
  >;
};

// Note: all of these handlers will be the single-source-of-truth for the apis exposed to the renderer process
export const allHandlers = {
  debug: debugHandlers,
  ui: uiHandlers,
  clipboard: clipboardHandlers,
  export: exportHandlers,
  updater: updaterHandlers,
} satisfies AllHandlers;

export const registerHandlers = () => {
  // TODO: listen to namespace instead of individual event types
  ipcMain.setMaxListeners(100);
  for (const [namespace, namespaceHandlers] of Object.entries(allHandlers)) {
    for (const [key, handler] of Object.entries(namespaceHandlers)) {
      const chan = `${namespace}:${key}`;
      ipcMain.handle(chan, async (e, ...args) => {
        const start = performance.now();
        try {
          // @ts-expect-error - TODO: fix this
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
      });
    }
  }
};
