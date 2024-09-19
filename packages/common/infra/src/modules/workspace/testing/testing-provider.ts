import { WorkspaceFlavour } from '@affine/env/workspace';
import { DocCollection, nanoid } from '@blocksuite/affine/store';
import { map } from 'rxjs';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import { Service } from '../../../framework';
import { LiveData } from '../../../livedata';
import { wrapMemento } from '../../../storage';
import {
  type BlobStorage,
  type DocStorage,
  MemoryDocStorage,
} from '../../../sync';
import { MemoryBlobStorage } from '../../../sync/blob/blob';
import type { GlobalState } from '../../storage';
import type { WorkspaceProfileInfo } from '../entities/profile';
import { getAFFiNEWorkspaceSchema } from '../global-schema';
import type { WorkspaceMetadata } from '../metadata';
import type {
  WorkspaceEngineProvider,
  WorkspaceFlavourProvider,
} from '../providers/flavour';

export class TestingWorkspaceLocalProvider
  extends Service
  implements WorkspaceFlavourProvider
{
  flavour: WorkspaceFlavour = WorkspaceFlavour.LOCAL;

  store = wrapMemento(this.globalStore, 'testing/');
  workspaceListStore = wrapMemento(this.store, 'workspaces/');
  docStorage = new MemoryDocStorage(wrapMemento(this.store, 'docs/'));

  constructor(private readonly globalStore: GlobalState) {
    super();
  }

  async deleteWorkspace(id: string): Promise<void> {
    const list = this.workspaceListStore.get<WorkspaceMetadata[]>('list') ?? [];
    const newList = list.filter(meta => meta.id !== id);
    this.workspaceListStore.set('list', newList);
  }
  async createWorkspace(
    initial: (
      docCollection: DocCollection,
      blobStorage: BlobStorage,
      docStorage: DocStorage
    ) => Promise<void>
  ): Promise<WorkspaceMetadata> {
    const id = nanoid();
    const meta = { id, flavour: WorkspaceFlavour.LOCAL };

    const blobStorage = new MemoryBlobStorage(
      wrapMemento(this.store, id + '/blobs/')
    );

    const docCollection = new DocCollection({
      id: id,
      idGenerator: () => nanoid(),
      schema: getAFFiNEWorkspaceSchema(),
      blobSources: {
        main: blobStorage,
      },
    });

    // apply initial state
    await initial(docCollection, blobStorage, this.docStorage);

    // save workspace to storage
    await this.docStorage.doc.set(id, encodeStateAsUpdate(docCollection.doc));
    for (const subdocs of docCollection.doc.getSubdocs()) {
      await this.docStorage.doc.set(subdocs.guid, encodeStateAsUpdate(subdocs));
    }

    const list = this.workspaceListStore.get<WorkspaceMetadata[]>('list') ?? [];
    this.workspaceListStore.set('list', [...list, meta]);

    return { id, flavour: WorkspaceFlavour.LOCAL };
  }
  workspaces$ = LiveData.from<WorkspaceMetadata[]>(
    this.workspaceListStore
      .watch<WorkspaceMetadata[]>('list')
      .pipe(map(m => m ?? [])),
    []
  );
  async getWorkspaceProfile(
    id: string
  ): Promise<WorkspaceProfileInfo | undefined> {
    const data = await this.docStorage.doc.get(id);

    if (!data) {
      return;
    }

    const bs = new DocCollection({
      id,
      schema: getAFFiNEWorkspaceSchema(),
    });

    applyUpdate(bs.doc, data);

    return {
      name: bs.meta.name,
      avatar: bs.meta.avatar,
      isOwner: true,
    };
  }
  getWorkspaceBlob(id: string, blob: string): Promise<Blob | null> {
    return new MemoryBlobStorage(wrapMemento(this.store, id + '/blobs/')).get(
      blob
    );
  }
  getEngineProvider(workspaceId: string): WorkspaceEngineProvider {
    return {
      getDocStorage: () => {
        return this.docStorage;
      },
      getAwarenessConnections() {
        return [];
      },
      getDocServer() {
        return null;
      },
      getLocalBlobStorage: () => {
        return new MemoryBlobStorage(
          wrapMemento(this.store, workspaceId + '/blobs/')
        );
      },
      getRemoteBlobStorages() {
        return [];
      },
    };
  }
}
