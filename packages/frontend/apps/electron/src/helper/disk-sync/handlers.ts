import fs from 'node:fs';
import path from 'node:path';

import type { DiskSyncEvent as NativeDiskSyncEvent } from '@affine/native';
import { DiskSync } from '@affine/native';
import type { DocClock, DocUpdate } from '@affine/nbstore';
import type { DiskSessionOptions, DiskSyncEvent } from '@affine/nbstore/disk';

import { diskSyncSubjects } from './subjects';

interface DiskSyncSubscriber {
  unsubscribe(): Promise<void | Error> | void | Error;
}

type NapiMaybe<T> = T | Error;

function unwrapNapiResult<T>(result: NapiMaybe<T>, action: string): T {
  if (result instanceof Error) {
    throw new Error(`[disk] ${action} failed: ${result.message}`);
  }
  return result;
}

function normalizeTimestamp(timestamp: unknown): Date | null {
  const normalized =
    timestamp instanceof Date ? timestamp : new Date(timestamp as string);
  if (Number.isNaN(normalized.getTime())) {
    return null;
  }
  return normalized;
}

function normalizeDiskSyncEvent(
  event: NativeDiskSyncEvent
): DiskSyncEvent | null {
  switch (event.type) {
    case 'ready':
      return { type: 'ready' };
    case 'doc-update': {
      if (!event.update || !(event.update.bin instanceof Uint8Array)) {
        return null;
      }
      const timestamp = normalizeTimestamp(event.update.timestamp);
      if (!timestamp) {
        return null;
      }
      return {
        type: 'doc-update',
        update: {
          docId: event.update.docId,
          bin: event.update.bin,
          timestamp,
          editor: event.update.editor,
        },
        origin: event.origin,
      };
    }
    case 'doc-delete': {
      if (typeof event.docId !== 'string') {
        return null;
      }
      const timestamp = normalizeTimestamp(event.timestamp);
      if (!timestamp) {
        return null;
      }
      return {
        type: 'doc-delete',
        docId: event.docId,
        timestamp,
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

type DiskSyncRuntime = InstanceType<typeof DiskSync> & {
  startSession(
    sessionId: string,
    options: DiskSessionOptions
  ): Promise<NapiMaybe<void>>;
  stopSession(sessionId: string): Promise<NapiMaybe<void>>;
  applyLocalUpdate(
    sessionId: string,
    update: DocUpdate,
    origin?: string
  ): Promise<NapiMaybe<DocClock>>;
  subscribeEvents(
    sessionId: string,
    callback: (err: Error | null, event: NativeDiskSyncEvent) => void
  ): Promise<NapiMaybe<DiskSyncSubscriber>>;
};

const diskSync = new DiskSync() as DiskSyncRuntime;
const subscriptions = new Map<string, () => Promise<void>>();

function e2eLog(options: DiskSessionOptions, line: string) {
  if (process.env.AFFINE_E2E !== '1') {
    return;
  }
  try {
    const p = path.join(options.syncFolder, '.disk-e2e.log');
    fs.appendFileSync(p, `${new Date().toISOString()}\t${line}\n`, 'utf8');
  } catch {
    // ignore
  }
}

export async function startSession(
  sessionId: string,
  options: DiskSessionOptions
): Promise<void> {
  e2eLog(
    options,
    `startSession\t${sessionId}\tworkspaceId=${options.workspaceId}\tsyncFolder=${options.syncFolder}`
  );
  unwrapNapiResult(
    await diskSync.startSession(sessionId, options),
    'startSession'
  );

  if (subscriptions.has(sessionId)) {
    return;
  }

  const subscriber = unwrapNapiResult(
    await diskSync.subscribeEvents(sessionId, (err, event) => {
      if (err) {
        return;
      }
      const normalizedEvent = normalizeDiskSyncEvent(event);
      if (!normalizedEvent) {
        return;
      }
      diskSyncSubjects.event$.next({ sessionId, event: normalizedEvent });
    }),
    'subscribeEvents'
  );
  subscriptions.set(sessionId, async () => {
    unwrapNapiResult(await subscriber.unsubscribe(), 'unsubscribe');
  });
}

export async function stopSession(sessionId: string): Promise<void> {
  await subscriptions.get(sessionId)?.();
  subscriptions.delete(sessionId);
  unwrapNapiResult(await diskSync.stopSession(sessionId), 'stopSession');
}

export async function applyLocalUpdate(
  sessionId: string,
  update: DocUpdate,
  origin?: string
): Promise<DocClock> {
  // syncFolder isn't directly available here; we log per session start only.
  return unwrapNapiResult(
    await diskSync.applyLocalUpdate(sessionId, update, origin),
    'applyLocalUpdate'
  );
}
