import type {
  StoreClient,
  WorkerInitOptions,
} from '@affine/nbstore/worker/client';
import { createIdentifier } from '@toeverything/infra';

export interface NbstoreProvider {
  /**
   * Open a nbstore with the given options, if the store with the given key already exists, it will be returned.
   *
   * in environment with SharedWorker support, the store also can be shared with other tabs/windows.
   *
   * @param key - the key of the store, can used to share the store with other tabs/windows.
   * @param options - the options to open the store.
   */
  openStore(
    key: string,
    options: WorkerInitOptions
  ): {
    store: StoreClient;
    dispose: () => void;
  };
}

export const NbstoreProvider =
  createIdentifier<NbstoreProvider>('NbstoreProvider');
