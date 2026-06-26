import type { MainEventRegister } from '../type';
import { localAIManager } from './manager';
import type { LocalAIRuntimeStatus } from './types';

export const localAIEvents = {
  onStatusChanged: (fn: (status: LocalAIRuntimeStatus) => void) => {
    return localAIManager.subscribe(fn);
  },
} satisfies Record<string, MainEventRegister>;

export const localAIHandlers = {
  getStatus: async () => localAIManager.getStatus(),
  ensureReady: async () => localAIManager.ensureReady(),
};
