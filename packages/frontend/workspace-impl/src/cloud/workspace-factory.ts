import { WorkspaceFlavour } from '@affine/env/workspace';
import type { WorkspaceFactory } from '@toeverything/infra';
import {
  AwarenessContext,
  AwarenessProvider,
  RemoteBlobStorage,
  RemoteSyncStorage,
  WorkspaceIdContext,
  WorkspaceScope,
} from '@toeverything/infra';
import type { ServiceCollection } from '@toeverything/infra/di';
import { CleanupService } from '@toeverything/infra/lifecycle';

import { LocalWorkspaceFactory } from '../local';
import { IndexedDBBlobStorage, SQLiteBlobStorage } from '../local';
import { AffineCloudAwarenessProvider } from './awareness';
import { AffineCloudBlobStorage } from './blob';
import { AffineSyncStorage } from './sync';

export class CloudWorkspaceFactory implements WorkspaceFactory {
  name = WorkspaceFlavour.AFFINE_CLOUD;
  configureWorkspace(services: ServiceCollection): void {
    // configure local-first providers
    new LocalWorkspaceFactory().configureWorkspace(services);

    services
      .scope(WorkspaceScope)
      .addImpl(RemoteBlobStorage('affine-cloud'), AffineCloudBlobStorage, [
        WorkspaceIdContext,
      ])
      .addImpl(RemoteSyncStorage('affine-cloud'), AffineSyncStorage, [
        WorkspaceIdContext,
        CleanupService,
      ])
      .addImpl(
        AwarenessProvider('affine-cloud'),
        AffineCloudAwarenessProvider,
        [WorkspaceIdContext, AwarenessContext]
      );
  }
  async getWorkspaceBlob(id: string, blobKey: string): Promise<Blob | null> {
    // try to get blob from local storage first
    const localBlobStorage = environment.isDesktop
      ? new SQLiteBlobStorage(id)
      : new IndexedDBBlobStorage(id);

    const localBlob = await localBlobStorage.get(blobKey);
    if (localBlob) {
      return localBlob;
    }

    const blobStorage = new AffineCloudBlobStorage(id);
    return await blobStorage.get(blobKey);
  }
}
