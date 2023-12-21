import { setupEditorFlags } from '@affine/env/global';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { nanoid } from 'nanoid';

import { WorkspaceEngine } from '../../engine';
import { BlobEngine } from '../../engine/blob';
import { SyncEngine } from '../../engine/sync';
import type { WorkspaceFactory } from '../../factory';
import { globalBlockSuiteSchema } from '../../global-schema';
import { Workspace } from '../../workspace';
import { createBroadcastChannelAwarenessProvider } from './awareness';
import { createLocalBlobStorage } from './blob';
import { createStaticBlobStorage } from './blob-static';
import { createLocalStorage } from './sync';

export const localWorkspaceFactory: WorkspaceFactory = {
  name: 'local',
  openWorkspace(metadata) {
    const blobEngine = new BlobEngine(createLocalBlobStorage(metadata.id), [
      createStaticBlobStorage(),
    ]);
    const bs = new BlockSuiteWorkspace({
      id: metadata.id,
      blobStorages: [
        () => ({
          crud: blobEngine,
        }),
      ],
      idGenerator: () => nanoid(),
      schema: globalBlockSuiteSchema,
    });
    const syncEngine = new SyncEngine(
      bs.doc,
      createLocalStorage(metadata.id),
      []
    );
    const awarenessProvider = createBroadcastChannelAwarenessProvider(
      metadata.id,
      bs.awarenessStore.awareness
    );
    const engine = new WorkspaceEngine(blobEngine, syncEngine, [
      awarenessProvider,
    ]);

    setupEditorFlags(bs);

    return new Workspace(metadata, engine, bs);
  },
  async getWorkspaceBlob(id, blobKey) {
    const blobStorage = createLocalBlobStorage(id);

    return await blobStorage.get(blobKey);
  },
};
