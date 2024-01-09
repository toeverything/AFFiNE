import { setupEditorFlags } from '@affine/env/global';
import type { WorkspaceFactory } from '@affine/workspace';
import { WorkspaceEngine } from '@affine/workspace';
import { BlobEngine } from '@affine/workspace';
import { SyncEngine } from '@affine/workspace';
import { globalBlockSuiteSchema } from '@affine/workspace';
import { Workspace } from '@affine/workspace';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { nanoid } from 'nanoid';

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
