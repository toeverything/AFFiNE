import { WorkspaceFlavour } from '@affine/env/workspace';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { differenceBy } from 'lodash-es';
import { nanoid } from 'nanoid';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import { type ServiceCollection } from '../di';
import { GlobalState, type Memento } from '../storage';
import { mergeUpdates } from '../utils/merge-updates';
import { WorkspaceMetadataContext } from './context';
import {
  AwarenessProvider,
  type BlobStorage,
  LocalBlobStorage,
  LocalSyncStorage,
  type SyncStorage,
} from './engine';
import type { WorkspaceFactory } from './factory';
import { globalBlockSuiteSchema } from './global-schema';
import type { WorkspaceListProvider } from './list';
import { type WorkspaceInfo } from './list';
import { type WorkspaceMetadata } from './metadata';
import { WorkspaceScope } from './service-scope';

const LIST_STORE_KEY = 'testing-workspace-list';

export class TestingLocalWorkspaceListProvider
  implements WorkspaceListProvider
{
  name = WorkspaceFlavour.LOCAL;

  constructor(private readonly state: Memento) {}

  getList(): Promise<WorkspaceMetadata[]> {
    const list = this.state.get<WorkspaceMetadata[]>(LIST_STORE_KEY);
    return Promise.resolve(list ?? []);
  }
  delete(workspaceId: string): Promise<void> {
    const list = this.state.get<WorkspaceMetadata[]>(LIST_STORE_KEY) ?? [];
    const newList = list.filter(meta => meta.id !== workspaceId);
    this.state.set(LIST_STORE_KEY, newList);
    return Promise.resolve();
  }
  async create(
    initial: (
      workspace: BlockSuiteWorkspace,
      blobStorage: BlobStorage
    ) => Promise<void>
  ): Promise<WorkspaceMetadata> {
    const id = nanoid();
    const meta = { id, flavour: WorkspaceFlavour.LOCAL };

    const blobStorage = new TestingBlobStorage(meta, this.state);
    const syncStorage = new TestingSyncStorage(meta, this.state);

    const workspace = new BlockSuiteWorkspace({
      id: id,
      idGenerator: () => nanoid(),
      schema: globalBlockSuiteSchema,
    });

    // apply initial state
    await initial(workspace, blobStorage);

    // save workspace to storage
    await syncStorage.push(id, encodeStateAsUpdate(workspace.doc));
    for (const subdocs of workspace.doc.getSubdocs()) {
      await syncStorage.push(subdocs.guid, encodeStateAsUpdate(subdocs));
    }

    const list = this.state.get<WorkspaceMetadata[]>(LIST_STORE_KEY) ?? [];
    this.state.set(LIST_STORE_KEY, [...list, meta]);

    return { id, flavour: WorkspaceFlavour.LOCAL };
  }
  subscribe(
    callback: (changed: {
      added?: WorkspaceMetadata[] | undefined;
      deleted?: WorkspaceMetadata[] | undefined;
    }) => void
  ): () => void {
    let lastWorkspaces: WorkspaceMetadata[] =
      this.state.get<WorkspaceMetadata[]>(LIST_STORE_KEY) ?? [];

    const sub = this.state
      .watch<WorkspaceMetadata[]>(LIST_STORE_KEY)
      .subscribe(allWorkspaces => {
        if (allWorkspaces) {
          const added = differenceBy(allWorkspaces, lastWorkspaces, v => v.id);
          const deleted = differenceBy(
            lastWorkspaces,
            allWorkspaces,
            v => v.id
          );
          lastWorkspaces = allWorkspaces;
          if (added.length || deleted.length) {
            callback({ added, deleted });
          }
        }
      });
    return () => {
      sub.unsubscribe();
    };
  }
  async getInformation(id: string): Promise<WorkspaceInfo | undefined> {
    // get information from root doc
    const storage = new TestingSyncStorage(
      {
        flavour: WorkspaceFlavour.LOCAL,
        id,
      },
      this.state
    );
    const data = await storage.pull(id, new Uint8Array([]));

    if (!data) {
      return;
    }

    const bs = new BlockSuiteWorkspace({
      id,
      schema: globalBlockSuiteSchema,
    });

    applyUpdate(bs.doc, data.data);

    return {
      name: bs.meta.name,
      avatar: bs.meta.avatar,
    };
  }
}

export class TestingLocalWorkspaceFactory implements WorkspaceFactory {
  constructor(private readonly state: Memento) {}

  name = WorkspaceFlavour.LOCAL;

  configureWorkspace(services: ServiceCollection): void {
    services
      .scope(WorkspaceScope)
      .addImpl(LocalBlobStorage, TestingBlobStorage, [
        WorkspaceMetadataContext,
        GlobalState,
      ])
      .addImpl(LocalSyncStorage, TestingSyncStorage, [
        WorkspaceMetadataContext,
        GlobalState,
      ])
      .addImpl(AwarenessProvider, TestingAwarenessProvider);
  }

  getWorkspaceBlob(id: string, blobKey: string): Promise<Blob | null> {
    return new TestingBlobStorage(
      {
        flavour: WorkspaceFlavour.LOCAL,
        id,
      },
      this.state
    ).get(blobKey);
  }
}

export class TestingSyncStorage implements SyncStorage {
  constructor(
    private readonly metadata: WorkspaceMetadata,
    private readonly state: Memento
  ) {}
  name: string = 'testing';
  async pull(
    docId: string,
    _: Uint8Array
  ): Promise<{ data: Uint8Array; state?: Uint8Array | undefined } | null> {
    const key = 'testing-sync/' + this.metadata.id + '/' + docId;
    const data = this.state.get<Uint8Array>(key);
    if (data) {
      return { data };
    } else {
      return null;
    }
  }
  async push(docId: string, data: Uint8Array): Promise<void> {
    const key = 'testing-sync/' + this.metadata.id + '/' + docId;
    const oldData = this.state.get<Uint8Array>(key);
    const update = mergeUpdates(oldData ? [oldData, data] : [data]);
    this.state.set(key, update);
  }
  async subscribe(
    _cb: (docId: string, data: Uint8Array) => void,
    _disconnect: (reason: string) => void
  ): Promise<() => void> {
    return () => {};
  }
}

export class TestingBlobStorage implements BlobStorage {
  name = 'testing';
  readonly = false;

  constructor(
    private readonly metadata: WorkspaceMetadata,
    private readonly state: Memento
  ) {}

  get(key: string) {
    const storeKey = 'testing-blob/' + this.metadata.id + '/' + key;
    return Promise.resolve(this.state.get<Blob>(storeKey) ?? null);
  }
  set(key: string, value: Blob) {
    const storeKey = 'testing-blob/' + this.metadata.id + '/' + key;
    this.state.set(storeKey, value);

    const listKey = 'testing-blob-list/' + this.metadata.id;
    const list = this.state.get<Set<string>>(listKey) ?? new Set<string>();
    list.add(key);
    this.state.set(listKey, list);

    return Promise.resolve(key);
  }
  delete(key: string) {
    this.state.set(key, null);

    const listKey = 'testing-blob-list/' + this.metadata.id;
    const list = this.state.get<Set<string>>(listKey) ?? new Set<string>();
    list.delete(key);
    this.state.set(listKey, list);

    return Promise.resolve();
  }
  list() {
    const listKey = 'testing-blob-list/' + this.metadata.id;
    const list = this.state.get<Set<string>>(listKey);
    return Promise.resolve(list ? Array.from(list) : []);
  }
}

export class TestingAwarenessProvider implements AwarenessProvider {
  connect(): void {
    /* do nothing */
  }
  disconnect(): void {
    /* do nothing */
  }
}
