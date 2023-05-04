import { ipcMain } from 'electron';

import { logger, revealLogFile } from '../logger';
import { dbHandlers } from './db';
import { dialogHandlers } from './dialog';
import { uiHandlers } from './ui';
import { workspaceHandlers } from './workspace';

type IsomorphicHandler = (
  e: Electron.IpcMainInvokeEvent,
  ...args: any[]
) => Promise<any>;

type NamespaceHandlers = {
  [key: string]: IsomorphicHandler;
};

export const debugHandlers = {
  revealLogFile: async () => {
    return revealLogFile();
  },
};

// Note: all of these handlers will be the single-source-of-truth for the apis exposed to the renderer process
export const allHandlers = {
  workspace: workspaceHandlers,
  ui: uiHandlers,
  db: dbHandlers,
  dialog: dialogHandlers,
  debug: debugHandlers,
} satisfies Record<string, NamespaceHandlers>;

export const registerHandlers = () => {
  for (const [namespace, namespaceHandlers] of Object.entries(allHandlers)) {
    for (const [key, handler] of Object.entries(namespaceHandlers)) {
      const chan = `${namespace}:${key}`;
      ipcMain.handle(chan, (e, ...args) => {
        logger.info(
          '[ipc]',
          chan,
          ...args.filter(arg => {
            return typeof arg !== 'object';
          })
        );
        return handler(e, ...args);
      });
    }
  }
};
