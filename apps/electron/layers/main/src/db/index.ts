import path from 'node:path';

import type { EventBasedChannel } from 'async-call-rpc';
import { AsyncCall } from 'async-call-rpc';
import { Worker } from 'worker_threads';

import { appContext } from '../context';
import type { MainEventListener, NamespaceHandlers } from '../type';
import type { DBHandlers } from './db-worker';
import { dbSubjects } from './subjects';

export * from './ensure-db';
export * from './subjects';

class ThreadWorkerChannel implements EventBasedChannel {
  constructor(private worker: Worker) {}

  on(listener: (data: unknown) => void) {
    this.worker.addListener('message', listener);
    return () => {
      this.worker.removeListener('message', listener);
    };
  }

  send(data: unknown) {
    this.worker.postMessage(data);
  }
}

const workerFile = path.join(__dirname, './db/db-worker.js');
const worker = new Worker(workerFile, {
  env: {
    AFFINE_NAME: appContext.appName,
    AFFINE_APP_DATA_PATH: appContext.appDataPath,
  },
});

const handlers = {
  onExternalUpdate: (workspaceId: string, update: Uint8Array) => {
    dbSubjects.externalUpdate.next({
      workspaceId,
      update,
    });
  },
} as const;

export type MainThreadHandlers = typeof handlers;

const rpc = AsyncCall<DBHandlers>(handlers, {
  channel: new ThreadWorkerChannel(worker),
});

export const dbHandlers = {
  getDocAsUpdates: async (_, id: string) => {
    return rpc.getDocAsUpdates(id);
  },
  applyDocUpdate: async (_, id: string, update: Uint8Array) => {
    return rpc.applyDocUpdate(id, update);
  },
  addBlob: async (_, workspaceId: string, key: string, data: Uint8Array) => {
    return rpc.addBlob(workspaceId, key, data);
  },
  getBlob: async (_, workspaceId: string, key: string) => {
    return rpc.getBlob(workspaceId, key);
  },
  deleteBlob: async (_, workspaceId: string, key: string) => {
    return rpc.deleteBlob(workspaceId, key);
  },
  getBlobKeys: async (_, workspaceId: string) => {
    return rpc.getBlobKeys(workspaceId);
  },
  getDefaultStorageLocation: async () => {
    return appContext.appDataPath;
  },
} satisfies NamespaceHandlers;

export const dbEvents = {
  onExternalUpdate: (
    fn: (update: { workspaceId: string; update: Uint8Array }) => void
  ) => {
    const sub = dbSubjects.externalUpdate.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventListener>;
