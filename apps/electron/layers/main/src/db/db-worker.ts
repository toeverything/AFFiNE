import type { MessagePort } from 'node:worker_threads';
import { parentPort } from 'node:worker_threads';

import type { EventBasedChannel } from 'async-call-rpc';
import { AsyncCall } from 'async-call-rpc';

import { ensureSQLiteDB } from './ensure-db';
import type { MainThreadHandlers } from './index';
import { dbSubjects } from './subjects';

class MessagePortChannel implements EventBasedChannel {
  constructor(private port: MessagePort) {}
  on(listener: (data: unknown) => void) {
    this.port.addListener('message', listener);
    return () => {
      this.port.removeListener('message', listener);
    };
  }

  send(data: unknown) {
    this.port.postMessage(data);
  }
}

const dbHandlers = {
  getDocAsUpdates: async (id: string) => {
    const workspaceDB = await ensureSQLiteDB(id);
    return workspaceDB.getDocAsUpdates();
  },
  applyDocUpdate: async (id: string, update: Uint8Array) => {
    const workspaceDB = await ensureSQLiteDB(id);
    return workspaceDB.applyUpdate(update);
  },
  addBlob: async (workspaceId: string, key: string, data: Uint8Array) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.addBlob(key, data);
  },
  getBlob: async (workspaceId: string, key: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.getBlob(key);
  },
  deleteBlob: async (workspaceId: string, key: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.deleteBlob(key);
  },
  getBlobKeys: async (workspaceId: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.getBlobKeys();
  },
} as const;

const handlers = {
  ...dbHandlers,
  onExternalUpdate: (
    fn: (update: { workspaceId: string; update: Uint8Array }) => void
  ) => {
    const sub = dbSubjects.externalUpdate.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
};

const rpc = AsyncCall<MainThreadHandlers>(handlers, {
  channel: new MessagePortChannel(parentPort!),
});

dbSubjects.externalUpdate.subscribe(async ({ workspaceId, update }) => {
  await rpc.onExternalUpdate(workspaceId, update);
});

export type DBHandlers = typeof handlers;
