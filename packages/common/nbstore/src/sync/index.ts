import { map, type Observable } from 'rxjs';

import type { SpaceStorage } from '../storage';
import { AwarenessSyncImpl } from './awareness';
import { BlobSyncImpl } from './blob';
import { DocSyncImpl, type DocSyncState } from './doc';
import { IndexerSyncImpl } from './indexer';
import type { PeerStorageOptions } from './types';

export type { BlobSyncState } from './blob';
export type { DocSyncDocState, DocSyncState } from './doc';
export type {
  IndexerDocSyncState,
  IndexerPreferOptions,
  IndexerSyncState,
} from './indexer';

export interface SyncState {
  doc?: DocSyncState;
}

export class Sync {
  readonly doc: DocSyncImpl;
  readonly blob: BlobSyncImpl;
  readonly awareness: AwarenessSyncImpl;
  readonly indexer: IndexerSyncImpl;

  readonly state$: Observable<SyncState>;

  constructor(readonly storages: PeerStorageOptions<SpaceStorage>) {
    const doc = storages.local.get('doc');
    const blob = storages.local.get('blob');
    const docSync = storages.local.get('docSync');
    const blobSync = storages.local.get('blobSync');
    const awareness = storages.local.get('awareness');
    const indexer = storages.local.get('indexer');
    const indexerSync = storages.local.get('indexerSync');

    this.doc = new DocSyncImpl(
      {
        local: doc,
        remotes: Object.fromEntries(
          Object.entries(storages.remotes).map(([peerId, remote]) => [
            peerId,
            remote.get('doc'),
          ])
        ),
      },
      docSync
    );
    this.blob = new BlobSyncImpl(
      {
        local: blob,
        remotes: Object.fromEntries(
          Object.entries(storages.remotes).map(([peerId, remote]) => [
            peerId,
            remote.get('blob'),
          ])
        ),
      },
      blobSync
    );
    this.awareness = new AwarenessSyncImpl({
      local: awareness,
      remotes: Object.fromEntries(
        Object.entries(storages.remotes).map(([peerId, remote]) => [
          peerId,
          remote.get('awareness'),
        ])
      ),
    });
    this.indexer = new IndexerSyncImpl(
      doc,
      {
        local: indexer,
        remotes: Object.fromEntries(
          Object.entries(storages.remotes).map(([peerId, remote]) => [
            peerId,
            remote.get('indexer'),
          ])
        ),
      },
      indexerSync
    );

    this.state$ = this.doc.state$.pipe(map(doc => ({ doc })));
  }

  start() {
    this.doc?.start();
    this.blob?.start();
    this.indexer?.start();
  }

  async reconfigure(remotes: Record<string, SpaceStorage>) {
    try {
      await Promise.all([
        this.doc.stop(),
        this.blob.reconfigure(
          Object.fromEntries(
            Object.entries(remotes).map(([id, storage]) => [
              id,
              storage.get('blob'),
            ])
          )
        ),
      ]);
      this.doc.setRemotes(
        Object.fromEntries(
          Object.entries(remotes).map(([id, storage]) => [
            id,
            storage.get('doc'),
          ])
        )
      );
      this.awareness.setRemotes(
        Object.fromEntries(
          Object.entries(remotes).map(([id, storage]) => [
            id,
            storage.get('awareness'),
          ])
        )
      );
      this.indexer.setRemotes(
        Object.fromEntries(
          Object.entries(remotes).map(([id, storage]) => [
            id,
            storage.get('indexer'),
          ])
        )
      );
      this.storages.remotes = remotes;
    } finally {
      this.doc.start();
      this.blob.start();
    }
  }

  async stop() {
    await Promise.all([this.doc.stop(), this.blob.stop(), this.indexer.stop()]);
  }
}
