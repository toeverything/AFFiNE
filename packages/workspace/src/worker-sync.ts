import { AsyncCall } from 'async-call-rpc';
import { WorkerChannel } from 'async-call-rpc/utils/web/worker';
import type { Doc } from 'yjs'

import type { WorkerMethods } from './worker';

export type SubdocEvent = {
  loaded: Set<Doc>;
  removed: Set<Doc>;
  added: Set<Doc>;
};

export function bindWorkerSync(
  api: ReturnType<typeof createWorkerSync>,
  rootDoc: Doc
) {
  rootDoc.on('update', (update, origin) => {
    api.sendUpdate(rootDoc.guid, update, origin ?? 'UNKNOWN').catch(console.error)
  })
  rootDoc.on('subdocs', (event: SubdocEvent) => {
    event.added.forEach(doc => {
      doc.on('update', (update, origin) => {
        api.sendUpdate(doc.guid, update, origin ?? 'UNKNOWN').catch(console.error)
      })
    })
  })
  rootDoc.subdocs.forEach(doc => bindWorkerSync(api, doc))
}

export function createWorkerSync() {
  return AsyncCall<WorkerMethods>(
    {},
    {
      channel: new WorkerChannel(
        new Worker(new URL('./worker.ts', import.meta.url))
      ),
    }
  );
}
