import type { DiskSyncEvent as NativeDiskSyncEvent } from '@affine/native';
import { DiskSync } from '@affine/native';
import type { DocClock, DocUpdate } from '@affine/nbstore';
import type { DiskSessionOptions, DiskSyncEvent } from '@affine/nbstore/disk';

import { diskSyncSubjects } from './subjects';

function normalizeDiskSyncEvent(
  event: NativeDiskSyncEvent
): DiskSyncEvent | null {
  switch (event.type) {
    case 'source-discovered':
      return typeof event.docId === 'string'
        ? { type: 'source-discovered', docId: event.docId }
        : null;
    case 'root-doc-discovered':
      return typeof event.docId === 'string'
        ? { type: 'root-doc-discovered', docId: event.docId }
        : null;
    case 'doc-update': {
      if (!event.update) {
        return null;
      }
      return {
        type: 'doc-update',
        update: {
          docId: event.update.docId,
          bin: event.update.bin,
          timestamp: event.update.timestamp,
          editor: event.update.editor,
        },
        origin: event.origin,
      };
    }
    case 'error': {
      if (typeof event.message !== 'string') {
        return null;
      }
      return {
        type: 'error',
        message: event.message,
      };
    }
    default:
      return null;
  }
}

const diskSync = new DiskSync();
const sessions = new Map<
  string,
  { users: number; unsubscribe: () => Promise<void> }
>();
const operations = new Map<string, Promise<void>>();

function serializeSession(sessionId: string, operation: () => Promise<void>) {
  const result = (operations.get(sessionId) ?? Promise.resolve()).then(
    operation
  );
  const settled = result.then(
    () => {},
    () => {}
  );
  operations.set(sessionId, settled);
  const clear = () => {
    if (operations.get(sessionId) === settled) {
      operations.delete(sessionId);
    }
  };
  settled.then(clear, clear);
  return result;
}

export async function startSession(
  sessionId: string,
  options: DiskSessionOptions
): Promise<void> {
  return serializeSession(sessionId, async () => {
    const active = sessions.get(sessionId);
    if (active) {
      active.users++;
      return;
    }

    await diskSync.startSession(sessionId, options);
    try {
      const subscriber = await diskSync.subscribeEvents(
        sessionId,
        (err, event) => {
          if (err) {
            return;
          }
          const normalizedEvent = normalizeDiskSyncEvent(event);
          if (normalizedEvent) {
            diskSyncSubjects.event$.next({ sessionId, event: normalizedEvent });
          }
        }
      );
      sessions.set(sessionId, {
        users: 1,
        unsubscribe: async () => {
          await subscriber.unsubscribe();
        },
      });
    } catch (error) {
      await diskSync.stopSession(sessionId);
      throw error;
    }
  });
}

export async function stopSession(sessionId: string): Promise<void> {
  return serializeSession(sessionId, async () => {
    const active = sessions.get(sessionId);
    if (!active) {
      return;
    }
    if (--active.users > 0) {
      return;
    }
    sessions.delete(sessionId);
    try {
      await active.unsubscribe();
    } finally {
      await diskSync.stopSession(sessionId);
    }
  });
}

export async function applyLocalUpdate(
  sessionId: string,
  update: DocUpdate
): Promise<DocClock> {
  return diskSync.applyLocalUpdate(sessionId, update);
}

export async function acknowledgeSourceUpdate(
  sessionId: string,
  docId: string,
  localSnapshot: Uint8Array
): Promise<void> {
  await diskSync.acknowledgeSourceUpdate(sessionId, docId, localSnapshot);
}

export async function prepareSourceDoc(
  sessionId: string,
  docId: string,
  localSnapshot?: Uint8Array,
  localRoot?: Uint8Array
): Promise<Uint8Array | null> {
  return diskSync.prepareSourceDoc(sessionId, docId, localSnapshot, localRoot);
}
