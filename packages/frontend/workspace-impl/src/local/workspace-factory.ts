import type { ServiceCollection, WorkspaceFactory } from '@toeverything/infra';
import {
  AwarenessContext,
  AwarenessProvider,
  LocalBlobStorage,
  LocalSyncStorage,
  RemoteBlobStorage,
  WorkspaceIdContext,
  WorkspaceScope,
} from '@toeverything/infra';

import { BroadcastChannelAwarenessProvider } from './awareness';
import { IndexedDBBlobStorage } from './blob-indexeddb';
import { SQLiteBlobStorage } from './blob-sqlite';
import { StaticBlobStorage } from './blob-static';
import { IndexedDBSyncStorage } from './sync-indexeddb';
import { SQLiteSyncStorage } from './sync-sqlite';

export class LocalWorkspaceFactory implements WorkspaceFactory {
  name = 'local';
  configureWorkspace(services: ServiceCollection): void {
    if (environment.isDesktop) {
      services
        .scope(WorkspaceScope)
        .addImpl(LocalBlobStorage, SQLiteBlobStorage, [WorkspaceIdContext])
        .addImpl(LocalSyncStorage, SQLiteSyncStorage, [WorkspaceIdContext]);
    } else {
      services
        .scope(WorkspaceScope)
        .addImpl(LocalBlobStorage, IndexedDBBlobStorage, [WorkspaceIdContext])
        .addImpl(LocalSyncStorage, IndexedDBSyncStorage, [WorkspaceIdContext]);
    }

    services
      .scope(WorkspaceScope)
      .addImpl(RemoteBlobStorage('static'), StaticBlobStorage)
      .addImpl(
        AwarenessProvider('broadcast-channel'),
        BroadcastChannelAwarenessProvider,
        [WorkspaceIdContext, AwarenessContext]
      );
  }
  async getWorkspaceBlob(id: string, blobKey: string): Promise<Blob | null> {
    const blobStorage = environment.isDesktop
      ? new SQLiteBlobStorage(id)
      : new IndexedDBBlobStorage(id);

    return await blobStorage.get(blobKey);
  }
}
