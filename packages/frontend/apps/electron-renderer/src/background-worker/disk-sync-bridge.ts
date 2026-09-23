import type { DocClock, DocUpdate } from '@affine/nbstore';
import type {
  DiskSessionOptions,
  DiskSyncApis,
  DiskSyncEvent,
} from '@affine/nbstore/disk';

type DiskSyncEventPayload = {
  sessionId: string;
  event: DiskSyncEvent;
};

interface DiskSyncHandlers {
  startSession: (
    sessionId: string,
    options: DiskSessionOptions
  ) => Promise<void>;
  stopSession: (sessionId: string) => Promise<void>;
  applyLocalUpdate: (
    sessionId: string,
    update: DocUpdate,
    origin?: string
  ) => Promise<DocClock>;
}

interface DiskSyncEvents {
  onEvent: (callback: (payload: DiskSyncEventPayload) => void) => () => void;
}

export function createDiskSyncApis(
  handlers: DiskSyncHandlers,
  events: DiskSyncEvents
): DiskSyncApis {
  return {
    startSession: (sessionId, options) => {
      return handlers.startSession(sessionId, options);
    },
    stopSession: sessionId => {
      return handlers.stopSession(sessionId);
    },
    applyLocalUpdate: (sessionId, update, origin) => {
      return handlers.applyLocalUpdate(sessionId, update, origin);
    },
    subscribeEvents: (sessionId, callback) => {
      return events.onEvent(payload => {
        if (payload.sessionId === sessionId) {
          callback(payload.event);
        }
      });
    },
  };
}
