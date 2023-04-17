import { DebugLogger } from '@affine/debug';
import type { LocalIndexedDBWorkerProvider } from '@affine/workspace/type';
import { CallbackSet } from '@affine/workspace/utils';
import type { Workspace } from '@blocksuite/store';
import { encodeStateAsUpdate } from 'yjs';

const logger = new DebugLogger('affine:workspace:worker');

let originInstance: any = null;
let registryInstance: Map<
  string,
  {
    workspace: Workspace;
    callbacks: Set<() => void>;
  }
> | null = null;
let workerInstance: any = null;

if (typeof window !== 'undefined') {
  import('./main').then(({ worker }) => {
    workerInstance = worker;
  });
  import('./main-api').then(({ registry, origin }) => {
    registryInstance = registry;
    originInstance = origin;
  });
}

export const createIndexeddbWorkerProvider = (
  blockSuiteWorkspace: Workspace
): LocalIndexedDBWorkerProvider => {
  logger.info('createIndexeddbWorkerProvider', blockSuiteWorkspace.id);
  const callbacks = new CallbackSet();
  const cb = (_: Uint8Array, origin: unknown) => {
    if (origin === originInstance) {
      callbacks.ready = true;
      callbacks.forEach(cb => cb());
    }
    blockSuiteWorkspace.doc.off('update', cb);
  };
  const api = {
    flavour: 'local-indexeddb-worker',
    background: true,
    callbacks: callbacks,
    cleanup(): void {
      // todo: implement this, current we don't use this method
    },
    connect(): void {
      if (workerInstance && registryInstance) {
        registryInstance.set(blockSuiteWorkspace.id, {
          workspace: blockSuiteWorkspace,
          callbacks,
        });
        workerInstance.register(
          blockSuiteWorkspace.id,
          encodeStateAsUpdate(blockSuiteWorkspace.doc)
        );
        blockSuiteWorkspace.doc.on('update', cb);
      } else {
        setTimeout(() => {
          api.connect();
        }, 50);
      }
    },
    disconnect(): void {
      if (workerInstance && registryInstance) {
        registryInstance.delete(blockSuiteWorkspace.id);
        workerInstance.unregister(blockSuiteWorkspace.id);
        callbacks.ready = false;
        blockSuiteWorkspace.doc.off('update', cb);
      } else {
        setTimeout(() => {
          api.disconnect();
        }, 50);
      }
    },
  } as const;
  return api;
};
