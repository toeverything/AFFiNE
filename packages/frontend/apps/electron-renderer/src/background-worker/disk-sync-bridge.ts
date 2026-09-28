import type { DiskSyncApis, DiskSyncEvent } from '@affine/nbstore/disk';

type DiskSyncEventPayload = {
  sessionId: string;
  event: DiskSyncEvent;
};

type DiskSyncHandlers = Pick<
  DiskSyncApis,
  | 'startSession'
  | 'stopSession'
  | 'applyLocalUpdate'
  | 'acknowledgeSourceUpdate'
  | 'prepareSourceDoc'
>;

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
    applyLocalUpdate: (sessionId, update) => {
      return handlers.applyLocalUpdate(sessionId, update);
    },
    acknowledgeSourceUpdate: (sessionId, docId, localSnapshot) => {
      return handlers.acknowledgeSourceUpdate(sessionId, docId, localSnapshot);
    },
    prepareSourceDoc: (sessionId, docId, localSnapshot, localRoot) => {
      return handlers.prepareSourceDoc(
        sessionId,
        docId,
        localSnapshot,
        localRoot
      );
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
