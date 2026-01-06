import EventEmitter2 from 'eventemitter2';

import type { AwarenessStorage } from './awareness';
import type { BlobStorage } from './blob';
import type { BlobSyncStorage } from './blob-sync';
import type { DocStorage } from './doc';
import type { DocSyncStorage } from './doc-sync';
import { DummyAwarenessStorage } from './dummy/awareness';
import { DummyBlobStorage } from './dummy/blob';
import { DummyBlobSyncStorage } from './dummy/blob-sync';
import { DummyDocStorage } from './dummy/doc';
import { DummyDocSyncStorage } from './dummy/doc-sync';
import { DummyIndexerStorage } from './dummy/indexer';
import { DummyIndexerSyncStorage } from './dummy/indexer-sync';
import type { IndexerStorage } from './indexer';
import type { IndexerSyncStorage } from './indexer-sync';
import type { StorageType } from './storage';

type Storages =
  | DocStorage
  | BlobStorage
  | BlobSyncStorage
  | DocSyncStorage
  | AwarenessStorage
  | IndexerStorage
  | IndexerSyncStorage;

export type SpaceStorageOptions = {
  [K in StorageType]?: Storages & { storageType: K };
};

export class SpaceStorage {
  protected readonly storages: {
    [K in StorageType]: Storages & { storageType: K };
  };
  private readonly event = new EventEmitter2();
  private readonly disposables: Set<() => void> = new Set();

  constructor(storages: SpaceStorageOptions) {
    this.storages = {
      awareness: storages.awareness ?? new DummyAwarenessStorage(),
      blob: storages.blob ?? new DummyBlobStorage(),
      blobSync: storages.blobSync ?? new DummyBlobSyncStorage(),
      doc: storages.doc ?? new DummyDocStorage(),
      docSync: storages.docSync ?? new DummyDocSyncStorage(),
      indexer: storages.indexer ?? new DummyIndexerStorage(),
      indexerSync: storages.indexerSync ?? new DummyIndexerSyncStorage(),
    };
  }

  get<T extends StorageType>(type: T): Extract<Storages, { storageType: T }> {
    const storage = this.storages[type];

    if (!storage) {
      throw new Error(`Storage ${type} not registered.`);
    }

    return storage as unknown as Extract<Storages, { storageType: T }>;
  }

  connect() {
    Object.values(this.storages).forEach(storage => {
      storage.connection.connect();
    });
  }

  disconnect() {
    Object.values(this.storages).forEach(storage => {
      storage.connection.disconnect();
    });
  }

  async waitForConnected(signal?: AbortSignal) {
    await Promise.all(
      Object.values(this.storages).map(storage =>
        storage.connection.waitForConnected(signal)
      )
    );
  }

  async destroy() {
    this.disposables.forEach(disposable => disposable());
    this.event.removeAllListeners();
  }
}

export * from './awareness';
export * from './blob';
export * from './blob-sync';
export * from './doc';
export * from './doc-sync';
export * from './errors';
export * from './history';
export * from './indexer';
export * from './indexer-sync';
export * from './storage';
