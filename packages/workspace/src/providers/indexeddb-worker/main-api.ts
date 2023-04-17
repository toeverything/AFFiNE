/**
 * This file is used to define the API that the worker thread can call.
 */
import type { Workspace } from '@blocksuite/store';
import { applyUpdate } from 'yjs';

export const origin = Symbol('indexeddb-worker-origin');
export const registry = new Map<
  string,
  {
    workspace: Workspace;
    callbacks: Set<() => void>;
  }
>();
export const mainApi = {
  emitUpdate: (id: string, update: Uint8Array) => {
    if (registry.has(id)) {
      const { workspace } = registry.get(id)!;
      workspace.doc.transact(() => {
        applyUpdate(workspace.doc, update);
      }, origin as any);
    }
  },
  emitSync: (id: string) => {
    if (registry.has(id)) {
      const { callbacks } = registry.get(id)!;
      callbacks.forEach(cb => cb());
    }
  },
};

export type MainAPI = typeof mainApi;
