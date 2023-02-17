import { Workspace as BlocksuiteWorkspace } from '@blocksuite/store';
import assert from 'assert';

import { MessageCenter } from '../../message';
import type { User } from '../../types';
import { applyUpdate } from '../../utils';
import type { SyncMode } from '../../workspace-unit';
import { WorkspaceUnit } from '../../workspace-unit';
import type {
  CreateWorkspaceInfoParams,
  ProviderConstructorParams,
} from '../base';
import { BaseProvider } from '../base';
import type { Apis, WorkspaceDetail } from './apis';
// import { IndexedDBProvider } from '../local/indexeddb';
import { getApis, Workspace } from './apis';
import { WebsocketClient } from './channel';
import { WebsocketProvider } from './sync';
import {
  createBlocksuiteWorkspaceWithAuth,
  createWorkspaceUnit,
  loadWorkspaceUnit,
  migrateBlobDB,
} from './utils';

type ChannelMessage = {
  ws_list: Workspace[];
  ws_details: Record<string, WorkspaceDetail>;
  metadata: Record<string, { avatar: string; name: string }>;
};

export interface AffineProviderConstructorParams
  extends ProviderConstructorParams {
  apis?: Apis;
}

const {
  Y: { encodeStateAsUpdate },
} = BlocksuiteWorkspace;

export class AffineProvider extends BaseProvider {
  public id = 'affine';
  private _wsMap: Map<BlocksuiteWorkspace, WebsocketProvider> = new Map();
  private _apis: Apis;
  private _channel?: WebsocketClient;
  private _refreshToken?: string;
  // private _idbMap: Map<string, IndexedDBProvider> = new Map();
  private _workspaceLoadingQueue: Map<string, Promise<WorkspaceUnit>> =
    new Map();

  private _workspaces$: Promise<Workspace[]> | undefined;

  constructor({ apis, ...params }: AffineProviderConstructorParams) {
    super(params);
    this._apis = apis || getApis();
  }

  override async init() {
    this._apis.auth.onChange(() => {
      if (this._apis.auth.isLogin) {
        this._reconnectChannel();
      } else {
        this._destroyChannel();
      }
    });

    if (this._apis.auth.isExpired && this._apis.auth.refresh) {
      // do we need to await the following?
      this._apis.auth.refreshToken();
    }
  }

  private _reconnectChannel() {
    if (this._refreshToken !== this._apis.auth.refresh) {
      // need to reconnect
      this._destroyChannel();

      this._channel = new WebsocketClient(
        `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${
          window.location.host
        }/api/global/sync/`,
        this._logger,
        {
          params: {
            token: this._apis.auth.refresh,
          },
        }
      );

      this._channel.on('message', (msg: ChannelMessage) => {
        this._handlerAffineListMessage(msg);
      });

      this._refreshToken = this._apis.auth.refresh;
    }
  }

  private _destroyChannel() {
    if (this._channel) {
      this._channel.disconnect();
      this._channel.destroy();
      this._channel = undefined;
    }
  }

  private async _handlerAffineListMessage({
    ws_details,
    metadata,
  }: ChannelMessage) {
    this._logger('receive server message');
    const newlyCreatedWorkspaces: WorkspaceUnit[] = [];
    const currentWorkspaceIds = this._workspaces.list().map(w => w.id);
    const newlyRemovedWorkspaceIds = currentWorkspaceIds;
    for (const [id, detail] of Object.entries(ws_details)) {
      const { name, avatar } = metadata[id];

      /**
       * collect the workspaces that need to be removed in the context
       */
      const workspaceIndex = currentWorkspaceIds.indexOf(id);
      const ifWorkspaceExist = workspaceIndex !== -1;
      if (ifWorkspaceExist) {
        newlyRemovedWorkspaceIds.splice(workspaceIndex, 1);
      }

      /**
       * if workspace name is  not empty, it is  a valid workspace, so sync its state
       */
      if (name) {
        const workspace = {
          name: name,
          avatar,
          owner: {
            name: detail.owner.name,
            id: detail.owner.id,
            email: detail.owner.email,
            avatar: detail.owner.avatar_url,
          },
          published: detail.public,
          memberCount: detail.member_count,
          provider: this.id,
          syncMode: 'core' as SyncMode,
        };
        if (this._workspaces.get(id)) {
          // update workspaces
          this._workspaces.update(id, workspace);
        } else {
          if (!this._workspaceLoadingQueue.has(id)) {
            const p = loadWorkspaceUnit({ id, ...workspace }, this._apis);
            this._workspaceLoadingQueue.set(id, p);
            newlyCreatedWorkspaces.push(await p);
            this._workspaceLoadingQueue.delete(id);
          }
        }
      } else {
        console.log(`[log warn]  ${id} name is empty`);
      }
    }

    // sync newlyCreatedWorkspaces to context
    this._workspaces.add(newlyCreatedWorkspaces);

    // sync newlyRemoveWorkspaces to context
    this._workspaces.remove(newlyRemovedWorkspaceIds);
  }

  private _getWebsocketProvider(workspace: BlocksuiteWorkspace) {
    const { doc, room } = workspace;
    assert(room);
    assert(doc);
    let ws = this._wsMap.get(workspace);
    if (!ws) {
      const wsUrl = `${
        window.location.protocol === 'https:' ? 'wss' : 'ws'
      }://${window.location.host}/api/sync/`;
      ws = new WebsocketProvider(wsUrl, room, doc, {
        params: { token: this._apis.auth.refresh },
        // @ts-expect-error ignore the type
        awareness: workspace.awarenessStore.awareness,
      });
      workspace.awarenessStore.awareness.setLocalStateField('user', {
        name: this._apis.auth.user?.name ?? 'other',
        id: Number(this._apis.auth.user?.id ?? -1),
        color: '#ffa500',
      });

      this._wsMap.set(workspace, ws);
    }
    return ws;
  }

  private async _applyCloudUpdates(
    blocksuiteWorkspace: BlocksuiteWorkspace,
    published = false
  ) {
    const { room: workspaceId } = blocksuiteWorkspace;
    assert(workspaceId, 'Blocksuite Workspace without room(workspaceId).');
    const updates = await this._apis.downloadWorkspace(workspaceId, published);
    await applyUpdate(blocksuiteWorkspace, new Uint8Array(updates));
  }

  override async loadPublicWorkspace(blocksuiteWorkspace: BlocksuiteWorkspace) {
    await this._applyCloudUpdates(blocksuiteWorkspace, true);
    return blocksuiteWorkspace;
  }

  override async warpWorkspace(workspace: BlocksuiteWorkspace) {
    workspace.setGettingBlobOptions(
      (k: string) => ({ api: '/api/workspace', token: this.getToken() }[k])
    );
    // FIXME: if add indexedDB cache in the future, can remove following line.
    await this._applyCloudUpdates(workspace);
    const { room } = workspace;
    assert(room);
    this.linkLocal(workspace);
    const ws = this._getWebsocketProvider(workspace);
    // close all websocket links
    Array.from(this._wsMap.entries()).forEach(([blocksuiteWorkspace, ws]) => {
      if (blocksuiteWorkspace !== workspace) {
        ws.disconnect();
      }
    });
    ws.connect();
    await new Promise<void>((resolve, reject) => {
      // TODO: synced will also be triggered on reconnection after losing sync
      // There needs to be an event mechanism to emit the synchronization state to the upper layer
      assert(ws);
      ws.once('synced', () => resolve());
      ws.once('lost-connection', () => resolve());
      ws.once('connection-error', () => reject());
    });
    return workspace;
  }

  override async loadWorkspaces() {
    if (!this._apis.auth.isLogin) {
      return [];
    }

    // cache workspaces and workspaceUnits results so that simultaneous calls
    // to loadWorkspaces will not cause multiple requests
    if (!this._workspaces$) {
      this._workspaces$ = this._apis.getWorkspaces();
    }

    const workspacesList = await this._workspaces$;
    const workspaceUnits = await Promise.all(
      workspacesList.map(async w => {
        let p = this._workspaceLoadingQueue.get(w.id);
        if (!p) {
          // may only need to load the primary one instead of all of them?
          // it will take a long time to load all of the workspaces
          // at least we shall use p-map to load them in chunks
          p = loadWorkspaceUnit(
            {
              id: w.id,
              name: '',
              avatar: undefined,
              owner: undefined,
              published: w.public,
              memberCount: 1,
              provider: this.id,
              syncMode: 'core',
            },
            this._apis
          );
          this._workspaceLoadingQueue.set(w.id, p);
        }
        const workspaceUnit = await p;
        this._workspaceLoadingQueue.delete(w.id);

        return workspaceUnit;
      })
    );

    // release cache
    this._workspaces$ = undefined;

    this._workspaces.add(workspaceUnits);
    return workspaceUnits;
  }

  override async auth() {
    if (this._apis.auth.isLogin) {
      await this._apis.auth.refreshToken();
      if (this._apis.auth.isLogin && !this._apis.auth.isExpired) {
        // login success
        return;
      }
    }

    const user = await this._apis.signInWithGoogle?.();

    if (!user) {
      this._sendMessage(MessageCenter.messageCode.loginError);
    }
  }

  // TODO: may need to update related workspace attributes on user info change?
  public override async getUserInfo(): Promise<User | undefined> {
    const user = this._apis.auth.user;
    return user
      ? {
          id: user.id,
          name: user.name,
          avatar: user.avatar_url,
          email: user.email,
        }
      : undefined;
  }

  public override async deleteWorkspace(id: string): Promise<void> {
    await this.closeWorkspace(id);
    // IndexedDBProvider.delete(id);
    await this._apis.deleteWorkspace({ id });
    this._workspaces.remove(id);
  }

  public override async clear(): Promise<void> {
    for (const w of this._workspaces.list()) {
      if (w.id) {
        try {
          await this.deleteWorkspace(w.id);
          this._workspaces.remove(w.id);
        } catch (e) {
          this._logger('has a problem of delete workspace ', e);
        }
      }
    }
    this._workspaces.clear();
  }

  public override async closeWorkspace(id: string) {
    // const idb = this._idbMap.get(id);
    // idb?.destroy();
    const workspaceUnit = this._workspaces.get(id);
    const ws = workspaceUnit?.blocksuiteWorkspace
      ? this._wsMap.get(workspaceUnit?.blocksuiteWorkspace)
      : null;
    if (!ws) {
      console.error('close workspace websocket which not exist.');
    }
    ws?.disconnect();
  }

  public override async leaveWorkspace(id: string): Promise<void> {
    await this._apis.leaveWorkspace({ id });
  }

  public override async invite(id: string, email: string): Promise<void> {
    return await this._apis.inviteMember({ id, email });
  }

  public override async removeMember(permissionId: number): Promise<void> {
    return await this._apis.removeMember({ permissionId });
  }

  public override async linkLocal(workspace: BlocksuiteWorkspace) {
    return workspace;
    // assert(workspace.room);
    // let idb = this._idbMap.get(workspace.room);
    // idb?.destroy();
    // idb = new IndexedDBProvider(workspace.room, workspace.doc);
    // this._idbMap.set(workspace.room, idb);
    // await idb.whenSynced;
    // this._logger('Local data loaded');
    // return workspace;
  }

  public override async createWorkspace(
    meta: CreateWorkspaceInfoParams
  ): Promise<WorkspaceUnit | undefined> {
    const workspaceUnitForUpload = await createWorkspaceUnit({
      id: '',
      name: meta.name,
      avatar: undefined,
      owner: await this.getUserInfo(),
      published: false,
      memberCount: 1,
      provider: this.id,
      syncMode: 'core',
    });
    const { id } = await this._apis.createWorkspace(
      new Blob([
        encodeStateAsUpdate(workspaceUnitForUpload.blocksuiteWorkspace!.doc)
          .buffer,
      ])
    );

    const workspaceUnit = await createWorkspaceUnit({
      id,
      name: meta.name,
      avatar: undefined,
      owner: await this.getUserInfo(),
      published: false,
      memberCount: 1,
      provider: this.id,
      syncMode: 'core',
    });

    this._workspaces.add(workspaceUnit);

    return workspaceUnit;
  }

  public override async publish(id: string, isPublish: boolean): Promise<void> {
    await this._apis.updateWorkspace({ id, public: isPublish });
  }

  public override getToken(): string {
    return this._apis.auth.token;
  }

  public override async getUserByEmail(
    workspace_id: string,
    email: string
  ): Promise<User | null> {
    const users = await this._apis.getUserByEmail({ workspace_id, email });
    return users?.length
      ? {
          id: users[0].id,
          name: users[0].name,
          avatar: users[0].avatar_url,
          email: users[0].email,
        }
      : null;
  }

  public override async extendWorkspace(
    workspaceUnit: WorkspaceUnit
  ): Promise<WorkspaceUnit> {
    const { id } = await this._apis.createWorkspace(
      new Blob([
        encodeStateAsUpdate(workspaceUnit.blocksuiteWorkspace!.doc).buffer,
      ])
    );
    const newWorkspaceUnit = new WorkspaceUnit({
      id,
      name: workspaceUnit.name,
      avatar: undefined,
      owner: await this.getUserInfo(),
      published: false,
      memberCount: 1,
      provider: this.id,
      syncMode: 'core',
    });
    await migrateBlobDB(workspaceUnit.id, id);

    const blocksuiteWorkspace = await createBlocksuiteWorkspaceWithAuth(id);
    assert(workspaceUnit.blocksuiteWorkspace);
    await applyUpdate(
      blocksuiteWorkspace,
      encodeStateAsUpdate(workspaceUnit.blocksuiteWorkspace.doc)
    );

    newWorkspaceUnit.setBlocksuiteWorkspace(blocksuiteWorkspace);

    this._workspaces.add(newWorkspaceUnit);
    return newWorkspaceUnit;
  }

  public override async logout(): Promise<void> {
    this._apis.auth.clear();
    this._destroyChannel();
    this._wsMap.forEach(ws => ws.disconnect());
    this._workspaces.clear(false);
    await this._apis.signOutFirebase();
  }

  public override async getWorkspaceMembers(id: string) {
    return this._apis.getWorkspaceMembers({ id });
  }

  public override async acceptInvitation(invitingCode: string) {
    return await this._apis.acceptInviting({ invitingCode });
  }
}
