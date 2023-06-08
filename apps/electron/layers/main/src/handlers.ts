import type {
  DBHandlerManager,
  DebugHandlerManager,
  DialogHandlerManager,
  ExportHandlerManager,
  UIHandlerManager,
  UnwrapManagerHandlerToServerSide,
  UpdaterHandlerManager,
  WorkspaceHandlerManager,
} from '@toeverything/infra';
import { ipcMain } from 'electron';

import { dbHandlers } from './db';
import { dialogHandlers } from './dialog';
import { exportHandlers } from './export';
import { getLogFilePath, logger, revealLogFile } from './logger';
import { uiHandlers } from './ui';
import { updaterHandlers } from './updater';
import { workspaceHandlers } from './workspace';

export const debugHandlers = {
  revealLogFile: async () => {
    return revealLogFile();
  },
  logFilePath: async () => {
    return getLogFilePath();
  },
};

type AllHandlers = {
  db: UnwrapManagerHandlerToServerSide<
    Electron.IpcMainInvokeEvent,
    DBHandlerManager
  >;
  debug: UnwrapManagerHandlerToServerSide<
    Electron.IpcMainInvokeEvent,
    DebugHandlerManager
  >;
  dialog: UnwrapManagerHandlerToServerSide<
    Electron.IpcMainInvokeEvent,
    DialogHandlerManager
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
  workspace: UnwrapManagerHandlerToServerSide<
    Electron.IpcMainInvokeEvent,
    WorkspaceHandlerManager
  >;
};

// Note: all of these handlers will be the single-source-of-truth for the apis exposed to the renderer process
export const allHandlers = {
  db: dbHandlers,
  debug: debugHandlers,
  dialog: dialogHandlers,
  ui: uiHandlers,
  export: exportHandlers,
  updater: updaterHandlers,
  workspace: workspaceHandlers,
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
