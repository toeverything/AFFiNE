import type { Workspace } from '@blocksuite/store';
import { AsyncCall } from 'async-call-rpc';
import { WorkerChannel } from 'async-call-rpc/utils/web/worker';
import type { Doc } from 'yjs';
import { applyUpdate } from 'yjs';

import type { WorkerMethods } from './worker';

const docMap = new Map<string, Doc>();

export type MainMethods = {
  applyUpdate: (
    guid: string,
    update: Uint8Array,
    origin?: string | number
  ) => Promise<void>;
};

export type SubdocEvent = {
  loaded: Set<Doc>;
  removed: Set<Doc>;
  added: Set<Doc>;
};

export function bindWorkerSync(
  api: ReturnType<typeof createWorkerSync>,
  workspace: Workspace
) {
  docMap.set(workspace.doc.guid, workspace.doc);
  const onSubdocs = (event: SubdocEvent) => {
    event.added.forEach(doc => {
      docMap.set(doc.guid, doc);
    });
    event.removed.forEach(doc => {
      docMap.delete(doc.guid);
    });
  };
  workspace.doc.on('subdocs', onSubdocs);
  workspace.doc.on('destroy', () => {
    workspace.doc.off('subdocs', onSubdocs);
    docMap.delete(workspace.doc.guid);
  });

  workspace.doc.on('update', (update: Uint8Array, origin: string | number) => {
    api.applyUpdate(workspace.doc.guid, update, origin).catch(console.error);
  });
  api.registerWorkspace(workspace.doc.guid).catch(console.error);
}

const mainMethods = {
  applyUpdate: async (guid, update, origin) => {
    const doc = docMap.get(guid);
    if (!doc) {
      throw new Error(`Doc ${guid} not found`);
    }
    applyUpdate(doc, update, origin);
  },
} satisfies MainMethods;

export function createWorkerSync() {
  return AsyncCall<WorkerMethods>(mainMethods, {
    channel: new WorkerChannel(
      new Worker(new URL('./worker.ts', import.meta.url))
    ),
    log: false,
  });
}
