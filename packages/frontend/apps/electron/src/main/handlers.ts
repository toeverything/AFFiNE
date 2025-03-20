import { ipcMain } from 'electron';

import { AFFINE_API_CHANNEL_NAME } from '../shared/type';
import { clipboardHandlers } from './clipboard';
import { configStorageHandlers } from './config-storage';
import { findInPageHandlers } from './find-in-page';
import { getLogFilePath, logger, revealLogFile } from './logger';
import { recordingHandlers } from './recording';
import { sharedStorageHandlers } from './shared-storage';
import { uiHandlers } from './ui/handlers';
import { updaterHandlers } from './updater';
import { workerHandlers } from './worker/handlers';

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
  updater: updaterHandlers,
  configStorage: configStorageHandlers,
  findInPage: findInPageHandlers,
  sharedStorage: sharedStorageHandlers,
  worker: workerHandlers,
  recording: recordingHandlers,
};

export const registerHandlers = () => {
  const handleIpcMessage = async (
    e: Electron.IpcMainInvokeEvent,
    ...args: any[]
  ) => {
    // args[0] is the `{namespace:key}`
    if (typeof args[0] !== 'string') {
      logger.error('invalid ipc message', args);
      return;
    }
    const channel = args[0] as string;
    const [namespace, key] = channel.split(':');

    if (!namespace || !key) {
      logger.error('invalid ipc message', args);
      return;
    }

    // @ts-expect-error - ignore here
    const handler = allHandlers[namespace]?.[key];

    if (!handler) {
      logger.error('handler not found for ', args[0]);
      return;
    }

    const start = Date.now();
    const realArgs = args.slice(1);
    const result = await handler(e, ...realArgs);

    logger.debug(
      '[ipc-api]',
      channel,
      realArgs.filter(
        arg => typeof arg !== 'function' && typeof arg !== 'object'
      ),
      '-',
      Date.now() - start,
      'ms'
    );

    return result;
  };

  ipcMain.handle(AFFINE_API_CHANNEL_NAME, async (e, ...args: any[]) => {
    return handleIpcMessage(e, ...args);
  });

  ipcMain.on(AFFINE_API_CHANNEL_NAME, (e, ...args: any[]) => {
    handleIpcMessage(e, ...args)
      .then(ret => {
        e.returnValue = ret;
      })
      .catch(() => {
        // never throw
      });
  });
};
