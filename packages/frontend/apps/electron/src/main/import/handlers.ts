import type { CreateImportSessionOptions } from '@affine/native';
import {
  cancelImportSession,
  createImportSession,
  disposeImportSession,
  nextImportBatch,
} from '@affine/native';

export const importHandlers = {
  createImportSession: (
    event: Electron.IpcMainInvokeEvent,
    options: CreateImportSessionOptions
  ) => {
    void event;
    return createImportSession({
      format: options.format,
      source: options.source,
      batchLimits: options.batchLimits,
    });
  },
  nextImportBatch: (event: Electron.IpcMainInvokeEvent, sessionId: string) => {
    void event;
    return nextImportBatch(sessionId);
  },
  cancelImportSession: (
    event: Electron.IpcMainInvokeEvent,
    sessionId: string
  ) => {
    void event;
    return cancelImportSession(sessionId);
  },
  disposeImportSession: (
    event: Electron.IpcMainInvokeEvent,
    sessionId: string
  ) => {
    void event;
    return disposeImportSession(sessionId);
  },
};
