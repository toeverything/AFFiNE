import { toArrayBuffer } from '@affine/core/utils/array-buffer';
import { DebugLogger } from '@affine/debug';
import {
  type BlobStorage,
  type DocStorage,
  type ListedBlobRecord,
  universalId,
} from '@affine/nbstore';
import {
  IndexedDBBlobStorage,
  IndexedDBBlobSyncStorage,
  IndexedDBDocStorage,
  IndexedDBDocSyncStorage,
  IndexedDBIndexerStorage,
  IndexedDBIndexerSyncStorage,
} from '@affine/nbstore/idb';
import {
  IndexedDBV1BlobStorage,
  IndexedDBV1DocStorage,
} from '@affine/nbstore/idb/v1';
import {
  SqliteBlobStorage,
  SqliteBlobSyncStorage,
  SqliteDocStorage,
  SqliteDocSyncStorage,
  SqliteIndexerStorage,
  SqliteIndexerSyncStorage,
} from '@affine/nbstore/sqlite';
import {
  SqliteV1BlobStorage,
  SqliteV1DocStorage,
} from '@affine/nbstore/sqlite/v1';
import type { WorkerInitOptions } from '@affine/nbstore/worker/client';
import type { FrameworkProvider } from '@toeverything/infra';
import { LiveData, Service } from '@toeverything/infra';
import { isEqual } from 'lodash-es';
import { nanoid } from 'nanoid';
import { Observable } from 'rxjs';
import { Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import { DesktopApiService } from '../../desktop-api';
import type {
  WorkspaceFlavourProvider,
  WorkspaceFlavoursProvider,
  WorkspaceMetadata,
  WorkspaceProfileInfo,
} from '../../workspace';
import { WorkspaceImpl } from '../../workspace/impls/workspace';
import { getWorkspaceProfileWorker } from './out-worker';
import {
  dedupeWorkspaceIds,
  normalizeWorkspaceIds,
} from './workspace-id-utils';

export const LOCAL_WORKSPACE_LOCAL_STORAGE_KEY = 'affine-local-workspace';
export const LOCAL_WORKSPACE_GLOBAL_STATE_KEY =
  'workspace-engine:local-workspace-ids:v1';
const LOCAL_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY =
  'affine-local-workspace-changed';

const logger = new DebugLogger('local-workspace');

type GlobalStateStorageLike = {
  ready: Promise<void>;
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
};

function getElectronGlobalStateStorage(): GlobalStateStorageLike | null {
  if (!BUILD_CONFIG.isElectron) {
    return null;
  }
  const sharedStorage = (
    globalThis as {
      __sharedStorage?: { globalState?: GlobalStateStorageLike };
    }
  ).__sharedStorage;
  return sharedStorage?.globalState ?? null;
}

function getLegacyLocalWorkspaceIds(): string[] {
  try {
    return normalizeWorkspaceIds(
      JSON.parse(
        localStorage.getItem(LOCAL_WORKSPACE_LOCAL_STORAGE_KEY) ?? '[]'
      )
    );
  } catch (e) {
    logger.error('Failed to get local workspace ids', e);
    return [];
  }
}

export function getLocalWorkspaceIds(): string[] {
  const globalState = getElectronGlobalStateStorage();
  if (globalState) {
    const value = globalState.get(LOCAL_WORKSPACE_GLOBAL_STATE_KEY);
    if (value !== undefined) {
      return normalizeWorkspaceIds(value);
    }
  }

  return getLegacyLocalWorkspaceIds();
}

export function setLocalWorkspaceIds(
  idsOrUpdater: string[] | ((ids: string[]) => string[])
) {
  const next = normalizeWorkspaceIds(
    typeof idsOrUpdater === 'function'
      ? idsOrUpdater(getLocalWorkspaceIds())
      : idsOrUpdater
  );
  const deduplicated = dedupeWorkspaceIds(next);

  const globalState = getElectronGlobalStateStorage();
  if (globalState) {
    globalState.set(LOCAL_WORKSPACE_GLOBAL_STATE_KEY, deduplicated);
    return;
  }

  try {
    localStorage.setItem(
      LOCAL_WORKSPACE_LOCAL_STORAGE_KEY,
      JSON.stringify(deduplicated)
    );
  } catch (e) {
    logger.error('Failed to set local workspace ids', e);
  }
}

class LocalWorkspaceFlavourProvider implements WorkspaceFlavourProvider {
  constructor(private readonly framework: FrameworkProvider) {
    if (BUILD_CONFIG.isElectron) {
      void this.ensureWorkspaceIdsMigrated();
    }
  }

  private migration: Promise<void> | null = null;

  private ensureWorkspaceIdsMigrated() {
    if (!BUILD_CONFIG.isElectron) {
      return;
    }
    if (this.migration) {
      return;
    }

    this.migration = (async () => {
      const electronApi = this.framework.get(DesktopApiService);
      await electronApi.sharedStorage.globalState.ready;

      const persistedIds = normalizeWorkspaceIds(
        electronApi.sharedStorage.globalState.get(
          LOCAL_WORKSPACE_GLOBAL_STATE_KEY
        )
      );
      const legacyIds = getLegacyLocalWorkspaceIds();

      let scannedIds: string[] = [];
      try {
        scannedIds =
          await electronApi.handler.workspace.listLocalWorkspaceIds();
      } catch (e) {
        logger.error('Failed to scan local workspace ids', e);
      }

      setLocalWorkspaceIds(currentIds => {
        return dedupeWorkspaceIds([
          ...currentIds,
          ...persistedIds,
          ...legacyIds,
          ...scannedIds,
        ]);
      });
    })()
      .catch(e => {
        logger.error('Failed to migrate local workspace ids', e);
      })
      .finally(() => {
        this.notifyChannel.postMessage(null);
      });
  }

  readonly flavour = 'local';
  readonly notifyChannel = new BroadcastChannel(
    LOCAL_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY
  );

  DocStorageType =
    BUILD_CONFIG.isElectron || BUILD_CONFIG.isIOS || BUILD_CONFIG.isAndroid
      ? SqliteDocStorage
      : IndexedDBDocStorage;
  DocStorageV1Type = BUILD_CONFIG.isElectron
    ? SqliteV1DocStorage
    : BUILD_CONFIG.isWeb || BUILD_CONFIG.isMobileWeb
      ? IndexedDBV1DocStorage
      : undefined;
  BlobStorageType =
    BUILD_CONFIG.isElectron || BUILD_CONFIG.isIOS || BUILD_CONFIG.isAndroid
      ? SqliteBlobStorage
      : IndexedDBBlobStorage;
  BlobStorageV1Type = BUILD_CONFIG.isElectron
    ? SqliteV1BlobStorage
    : BUILD_CONFIG.isWeb || BUILD_CONFIG.isMobileWeb
      ? IndexedDBV1BlobStorage
      : undefined;
  DocSyncStorageType =
    BUILD_CONFIG.isElectron || BUILD_CONFIG.isIOS || BUILD_CONFIG.isAndroid
      ? SqliteDocSyncStorage
      : IndexedDBDocSyncStorage;
  BlobSyncStorageType =
    BUILD_CONFIG.isElectron || BUILD_CONFIG.isIOS || BUILD_CONFIG.isAndroid
      ? SqliteBlobSyncStorage
      : IndexedDBBlobSyncStorage;
  IndexerStorageType =
    BUILD_CONFIG.isElectron || BUILD_CONFIG.isIOS || BUILD_CONFIG.isAndroid
      ? SqliteIndexerStorage
      : IndexedDBIndexerStorage;
  IndexerSyncStorageType = BUILD_CONFIG.isElectron
    ? SqliteIndexerSyncStorage
    : IndexedDBIndexerSyncStorage;

  async deleteWorkspace(id: string): Promise<void> {
    setLocalWorkspaceIds(ids => ids.filter(x => x !== id));

    // TODO(@forehalo): deleting logic for indexeddb workspaces
    if (BUILD_CONFIG.isElectron) {
      const electronApi = this.framework.get(DesktopApiService);
      await electronApi.handler.workspace.moveToTrash(
        universalId({ peer: 'local', type: 'workspace', id })
      );
    }
    // notify all browser tabs, so they can update their workspace list
    this.notifyChannel.postMessage(id);
  }
  async createWorkspace(
    initial: (
      docCollection: WorkspaceImpl,
      blobStorage: BlobStorage,
      docStorage: DocStorage
    ) => Promise<void>
  ): Promise<WorkspaceMetadata> {
    const id = nanoid();

    // save the initial state to local storage, then sync to cloud
    const docStorage = new this.DocStorageType({
      id: id,
      flavour: this.flavour,
      type: 'workspace',
    });
    docStorage.connection.connect();
    await docStorage.connection.waitForConnected();
    const blobStorage = new this.BlobStorageType({
      id: id,
      flavour: this.flavour,
      type: 'workspace',
    });
    blobStorage.connection.connect();
    await blobStorage.connection.waitForConnected();

    const docList = new Set<YDoc>();

    const docCollection = new WorkspaceImpl({
      id: id,
      rootDoc: new YDoc({ guid: id }),
      blobSource: {
        get: async key => {
          const record = await blobStorage.get(key);
          return record
            ? new Blob([toArrayBuffer(record.data)], { type: record.mime })
            : null;
        },
        delete: async () => {
          return;
        },
        list: async () => {
          return [];
        },
        set: async (id, blob) => {
          await blobStorage.set({
            key: id,
            data: new Uint8Array(await blob.arrayBuffer()),
            mime: blob.type,
          });
          return id;
        },
        name: 'blob',
        readonly: false,
      },
      onLoadDoc(doc) {
        docList.add(doc);
      },
    });

    try {
      // apply initial state
      await initial(docCollection, blobStorage, docStorage);

      for (const subdocs of docList) {
        await docStorage.pushDocUpdate({
          docId: subdocs.guid,
          bin: encodeStateAsUpdate(subdocs),
        });
      }

      docStorage.connection.disconnect();
      blobStorage.connection.disconnect();

      // save workspace id to local storage
      setLocalWorkspaceIds(ids => [...ids, id]);

      // notify all browser tabs, so they can update their workspace list
      this.notifyChannel.postMessage(id);
    } finally {
      docCollection.dispose();
    }

    return { id, flavour: 'local' };
  }
  workspaces$ = LiveData.from(
    new Observable<WorkspaceMetadata[]>(subscriber => {
      let last: WorkspaceMetadata[] | null = null;
      const emit = () => {
        const value = getLocalWorkspaceIds().map(id => ({
          id,
          flavour: 'local',
        }));
        if (isEqual(last, value)) return;
        subscriber.next(value);
        last = value;
      };

      emit();
      const channel = new BroadcastChannel(
        LOCAL_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY
      );
      channel.addEventListener('message', emit);

      return () => {
        channel.removeEventListener('message', emit);
        channel.close();
      };
    }),
    []
  );
  isRevalidating$ = new LiveData(false);
  revalidate(): void {
    if (BUILD_CONFIG.isElectron) {
      void this.ensureWorkspaceIdsMigrated();
    }
    // notify livedata to re-scan workspaces
    this.notifyChannel.postMessage(null);
  }

  async getWorkspaceProfile(
    id: string
  ): Promise<WorkspaceProfileInfo | undefined> {
    const docStorage = new this.DocStorageType({
      id: id,
      flavour: this.flavour,
      type: 'workspace',
      readonlyMode: true,
    });
    docStorage.connection.connect();
    await docStorage.connection.waitForConnected();
    const localData = await docStorage.getDoc(id);

    docStorage.connection.disconnect();

    if (!localData) {
      return {
        isOwner: true,
      };
    }

    const client = getWorkspaceProfileWorker();

    const result = await client.call(
      'renderWorkspaceProfile',
      [localData.bin].filter(Boolean) as Uint8Array[]
    );

    return {
      name: result.name,
      avatar: result.avatar,
      isOwner: true,
    };
  }

  async getWorkspaceBlob(id: string, blobKey: string): Promise<Blob | null> {
    const storage = new this.BlobStorageType({
      id: id,
      flavour: this.flavour,
      type: 'workspace',
    });
    storage.connection.connect();
    await storage.connection.waitForConnected();
    const blob = await storage.get(blobKey);
    return blob
      ? new Blob([toArrayBuffer(blob.data)], { type: blob.mime })
      : null;
  }

  async listBlobs(id: string): Promise<ListedBlobRecord[]> {
    const storage = new this.BlobStorageType({
      id: id,
      flavour: this.flavour,
      type: 'workspace',
    });
    storage.connection.connect();
    await storage.connection.waitForConnected();

    return storage.list();
  }

  async deleteBlob(
    id: string,
    blob: string,
    permanent: boolean
  ): Promise<void> {
    const storage = new this.BlobStorageType({
      id: id,
      flavour: this.flavour,
      type: 'workspace',
    });
    storage.connection.connect();
    await storage.connection.waitForConnected();
    await storage.delete(blob, permanent);
  }

  getEngineWorkerInitOptions(workspaceId: string): WorkerInitOptions {
    return {
      local: {
        doc: {
          name: this.DocStorageType.identifier,
          opts: {
            flavour: this.flavour,
            type: 'workspace',
            id: workspaceId,
          },
        },
        blob: {
          name: this.BlobStorageType.identifier,
          opts: {
            flavour: this.flavour,
            type: 'workspace',
            id: workspaceId,
          },
        },
        blobSync: {
          name: this.BlobSyncStorageType.identifier,
          opts: {
            flavour: this.flavour,
            type: 'workspace',
            id: workspaceId,
          },
        },
        docSync: {
          name: this.DocSyncStorageType.identifier,
          opts: {
            flavour: this.flavour,
            type: 'workspace',
            id: workspaceId,
          },
        },
        awareness: {
          name: 'BroadcastChannelAwarenessStorage',
          opts: {
            id: workspaceId,
          },
        },
        indexer: {
          name: this.IndexerStorageType.identifier,
          opts: {
            flavour: this.flavour,
            type: 'workspace',
            id: workspaceId,
          },
        },
        indexerSync: {
          name: this.IndexerSyncStorageType.identifier,
          opts: {
            flavour: this.flavour,
            type: 'workspace',
            id: workspaceId,
          },
        },
      },
      remotes: {
        v1: {
          doc: this.DocStorageV1Type
            ? {
                name: this.DocStorageV1Type.identifier,
                opts: {
                  id: workspaceId,
                  type: 'workspace',
                },
              }
            : undefined,
          blob: this.BlobStorageV1Type
            ? {
                name: this.BlobStorageV1Type.identifier,
                opts: {
                  id: workspaceId,
                  type: 'workspace',
                },
              }
            : undefined,
        },
      },
    };
  }
}

export class LocalWorkspaceFlavoursProvider
  extends Service
  implements WorkspaceFlavoursProvider
{
  constructor() {
    super();
  }

  workspaceFlavours$ = new LiveData<WorkspaceFlavourProvider[]>([
    new LocalWorkspaceFlavourProvider(this.framework),
  ]);
}
