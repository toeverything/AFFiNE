/**
 * This file is used to define the API that the main thread can call.
 */
import {
  createIndexedDBProvider,
  EarlyDisconnectError,
  indexeddbOrigin,
} from '@toeverything/y-indexeddb';
import { applyUpdate, Doc } from 'yjs';

import { mainThread } from './entry.worker';

type RegistryData = {
  doc: Doc;
  provider: ReturnType<typeof createIndexedDBProvider>;
  onUpdate: (update: Uint8Array, origin: unknown) => void;
};

const registry = new Map<string, RegistryData>();

async function register(id: string, update: Uint8Array) {
  const doc = new Doc();
  doc.transact(() => {
    applyUpdate(doc, update);
  }, indexeddbOrigin);
  const provider = createIndexedDBProvider(id, doc);
  const data = {
    doc,
    provider,
    callbacks: new Set(),
    onUpdate: (update: Uint8Array, origin: unknown) => {
      if (origin === indexeddbOrigin) {
        mainThread.emitUpdate(id, update);
      }
    },
  };
  registry.set(id, data);
  doc.on('update', data.onUpdate);
  provider.connect();
  provider.whenSynced
    .then(() => {
      mainThread.emitSync(id);
    })
    .catch(e => {
      if (e instanceof EarlyDisconnectError) {
        return;
      } else {
        throw e;
      }
    });
}

async function unregister(id: string) {
  if (registry.has(id)) {
    const data = registry.get(id) as RegistryData;
    data.provider.disconnect();
    data.doc.off('update', data.onUpdate);
    data.doc.destroy();
  }
  registry.delete(id);
}

export const workerApi = {
  register,
  unregister,
};

export type WorkerAPI = typeof workerApi;
