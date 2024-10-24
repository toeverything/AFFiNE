import { DebugLogger } from '@affine/debug';
import { WorkspaceFlavour } from '@affine/env/workspace';
import {
  createWorkspaceMutation,
  deleteWorkspaceMutation,
  getIsOwnerQuery,
  getWorkspacesQuery,
} from '@affine/graphql';
import { DocCollection } from '@blocksuite/affine/store';
import {
  ApplicationStarted,
  type BlobStorage,
  catchErrorInto,
  type DocStorage,
  exhaustMapSwitchUntilChanged,
  fromPromise,
  type GlobalState,
  LiveData,
  onComplete,
  OnEvent,
  onStart,
  type WorkspaceEngineProvider,
  type WorkspaceFlavourProvider,
  type WorkspaceMetadata,
  type WorkspaceProfileInfo,
} from '@toeverything/infra';
import { effect, getAFFiNEWorkspaceSchema, Service } from '@toeverything/infra';
import { isEqual } from 'lodash-es';
import { nanoid } from 'nanoid';
import { EMPTY, map, mergeMap } from 'rxjs';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import type {
  AuthService,
  FetchService,
  GraphQLService,
  WebSocketService,
} from '../../cloud';
import { AccountChanged } from '../../cloud';
import type { WorkspaceEngineStorageProvider } from '../providers/engine';
import { BroadcastChannelAwarenessConnection } from './engine/awareness-broadcast-channel';
import { CloudAwarenessConnection } from './engine/awareness-cloud';
import { CloudBlobStorage } from './engine/blob-cloud';
import { StaticBlobStorage } from './engine/blob-static';
import { CloudDocEngineServer } from './engine/doc-cloud';
import { CloudStaticDocStorage } from './engine/doc-cloud-static';

const CLOUD_WORKSPACES_CACHE_KEY = 'cloud-workspace:';

const logger = new DebugLogger('affine:cloud-workspace-flavour-provider');

@OnEvent(ApplicationStarted, e => e.revalidate)
@OnEvent(AccountChanged, e => e.revalidate)
export class CloudWorkspaceFlavourProviderService
  extends Service
  implements WorkspaceFlavourProvider
{
  constructor(
    private readonly globalState: GlobalState,
    private readonly authService: AuthService,
    private readonly storageProvider: WorkspaceEngineStorageProvider,
    private readonly graphqlService: GraphQLService,
    private readonly webSocketService: WebSocketService,
    private readonly fetchService: FetchService
  ) {
    super();
  }
  flavour: WorkspaceFlavour = WorkspaceFlavour.AFFINE_CLOUD;

  async deleteWorkspace(id: string): Promise<void> {
    await this.graphqlService.gql({
      query: deleteWorkspaceMutation,
      variables: {
        id: id,
      },
    });
    this.revalidate();
    await this.waitForLoaded();
  }
  async createWorkspace(
    initial: (
      docCollection: DocCollection,
      blobStorage: BlobStorage,
      docStorage: DocStorage
    ) => Promise<void>
  ): Promise<WorkspaceMetadata> {
    // create workspace on cloud, get workspace id
    const {
      createWorkspace: { id: workspaceId },
    } = await this.graphqlService.gql({
      query: createWorkspaceMutation,
    });

    // save the initial state to local storage, then sync to cloud
    const blobStorage = this.storageProvider.getBlobStorage(workspaceId);
    const docStorage = this.storageProvider.getDocStorage(workspaceId);

    const docCollection = new DocCollection({
      id: workspaceId,
      idGenerator: () => nanoid(),
      schema: getAFFiNEWorkspaceSchema(),
      blobSources: {
        main: blobStorage,
      },
    });

    // apply initial state
    await initial(docCollection, blobStorage, docStorage);

    // save workspace to local storage, should be vary fast
    await docStorage.doc.set(
      workspaceId,
      encodeStateAsUpdate(docCollection.doc)
    );
    for (const subdocs of docCollection.doc.getSubdocs()) {
      await docStorage.doc.set(subdocs.guid, encodeStateAsUpdate(subdocs));
    }

    this.revalidate();
    await this.waitForLoaded();

    return {
      id: workspaceId,
      flavour: WorkspaceFlavour.AFFINE_CLOUD,
    };
  }
  revalidate = effect(
    map(() => {
      return { accountId: this.authService.session.account$.value?.id };
    }),
    exhaustMapSwitchUntilChanged(
      (a, b) => a.accountId === b.accountId,
      ({ accountId }) => {
        return fromPromise(async signal => {
          if (!accountId) {
            return null; // no cloud workspace if no account
          }

          const { workspaces } = await this.graphqlService.gql({
            query: getWorkspacesQuery,
            context: {
              signal,
            },
          });

          const ids = workspaces.map(({ id, initialized }) => ({
            id,
            initialized,
          }));
          return {
            accountId,
            workspaces: ids.map(({ id, initialized }) => ({
              id,
              flavour: WorkspaceFlavour.AFFINE_CLOUD,
              initialized,
            })),
          };
        }).pipe(
          mergeMap(data => {
            if (data) {
              const { accountId, workspaces } = data;
              const sorted = workspaces.sort((a, b) => {
                return a.id.localeCompare(b.id);
              });
              this.globalState.set(
                CLOUD_WORKSPACES_CACHE_KEY + accountId,
                sorted
              );
              if (!isEqual(this.workspaces$.value, sorted)) {
                this.workspaces$.next(sorted);
              }
            } else {
              this.workspaces$.next([]);
            }
            return EMPTY;
          }),
          catchErrorInto(this.error$, err => {
            logger.error('error to revalidate cloud workspaces', err);
          }),
          onStart(() => this.isRevalidating$.next(true)),
          onComplete(() => this.isRevalidating$.next(false))
        );
      },
      ({ accountId }) => {
        if (accountId) {
          this.workspaces$.next(
            this.globalState.get(CLOUD_WORKSPACES_CACHE_KEY + accountId) ?? []
          );
        } else {
          this.workspaces$.next([]);
        }
      }
    )
  );
  error$ = new LiveData<any>(null);
  isRevalidating$ = new LiveData(false);
  workspaces$ = new LiveData<WorkspaceMetadata[]>([]);
  async getWorkspaceProfile(
    id: string,
    signal?: AbortSignal
  ): Promise<WorkspaceProfileInfo | undefined> {
    // get information from both cloud and local storage

    // we use affine 'static' storage here, which use http protocol, no need to websocket.
    const cloudStorage = new CloudStaticDocStorage(id, this.fetchService);
    const docStorage = this.storageProvider.getDocStorage(id);
    // download root doc
    const localData = await docStorage.doc.get(id);
    const cloudData = await cloudStorage.pull(id);

    const isOwner = await this.getIsOwner(id, signal);

    if (!cloudData && !localData) {
      return {
        isOwner,
      };
    }

    const bs = new DocCollection({
      id,
      schema: getAFFiNEWorkspaceSchema(),
    });

    if (localData) applyUpdate(bs.doc, localData);
    if (cloudData) applyUpdate(bs.doc, cloudData.data);

    return {
      name: bs.meta.name,
      avatar: bs.meta.avatar,
      isOwner,
    };
  }
  async getWorkspaceBlob(id: string, blob: string): Promise<Blob | null> {
    const localBlob = await this.storageProvider.getBlobStorage(id).get(blob);

    if (localBlob) {
      return localBlob;
    }

    const cloudBlob = new CloudBlobStorage(id);
    return await cloudBlob.get(blob);
  }
  getEngineProvider(workspaceId: string): WorkspaceEngineProvider {
    return {
      getAwarenessConnections: () => {
        return [
          new BroadcastChannelAwarenessConnection(workspaceId),
          new CloudAwarenessConnection(workspaceId, this.webSocketService),
        ];
      },
      getDocServer: () => {
        return new CloudDocEngineServer(workspaceId, this.webSocketService);
      },
      getDocStorage: () => {
        return this.storageProvider.getDocStorage(workspaceId);
      },
      getLocalBlobStorage: () => {
        return this.storageProvider.getBlobStorage(workspaceId);
      },
      getRemoteBlobStorages() {
        return [new CloudBlobStorage(workspaceId), new StaticBlobStorage()];
      },
    };
  }

  private async getIsOwner(workspaceId: string, signal?: AbortSignal) {
    return (
      await this.graphqlService.gql({
        query: getIsOwnerQuery,
        variables: {
          workspaceId,
        },
        context: { signal },
      })
    ).isOwner;
  }

  private waitForLoaded() {
    return this.isRevalidating$.waitFor(loading => !loading);
  }
}
