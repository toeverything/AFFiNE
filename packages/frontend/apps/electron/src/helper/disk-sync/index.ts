import type { MainEventRegister } from '../type';
import {
  acknowledgeSourceUpdate,
  applyLocalUpdate,
  prepareSourceDoc,
  startSession,
  stopSession,
} from './handlers';
import { diskSyncSubjects } from './subjects';

export const diskSyncHandlers = {
  startSession,
  stopSession,
  applyLocalUpdate,
  acknowledgeSourceUpdate,
  prepareSourceDoc,
};

export const diskSyncEvents = {
  onEvent: ((callback: (...args: any[]) => void) => {
    const subscription = diskSyncSubjects.event$.subscribe(payload => {
      callback(payload);
    });
    return () => {
      subscription.unsubscribe();
    };
  }) satisfies MainEventRegister,
};
