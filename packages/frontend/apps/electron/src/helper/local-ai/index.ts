import type { MainEventRegister } from '../type';
import { localAIManager } from './manager';
import type { LocalAIModelDownloadStatus, LocalAIRuntimeStatus } from './types';

export const localAIEvents = {
  onStatusChanged: (fn: (status: LocalAIRuntimeStatus) => void) => {
    return localAIManager.subscribe(fn);
  },
  onDownloadStatusChanged: (
    fn: (status: LocalAIModelDownloadStatus) => void
  ) => {
    return localAIManager.subscribeDownload(fn);
  },
} satisfies Record<string, MainEventRegister>;

export const localAIHandlers = {
  getStatus: async () => localAIManager.getStatus(),
  getDownloadStatus: async () => localAIManager.getDownloadStatus(),
  ensureReady: async () => localAIManager.ensureReady(),
  startDownload: async () => localAIManager.startDownload(),
};
