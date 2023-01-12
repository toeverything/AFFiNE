import { BaseProvider } from '../base.js';
import type {
  ProviderConstructorParams,
  CreateWorkspaceInfoParams,
} from '../base';
import type { User } from '../../types';
import { Workspace as BlocksuiteWorkspace } from '@blocksuite/store';
import { storage } from './storage.js';
import assert from 'assert';
import { WebsocketProvider } from './sync.js';
// import { IndexedDBProvider } from '../local/indexeddb';
import { getApis, Workspace } from './apis/index.js';
import type { Apis, WorkspaceDetail, Callback } from './apis';
import { token } from './apis/token.js';
import { WebsocketClient } from './channel';
import {
  loadWorkspaceUnit,
  createWorkspaceUnit,
  syncToCloud,
} from './utils.js';
import { WorkspaceUnit } from '../../workspace-unit.js';
import { createBlocksuiteWorkspace, applyUpdate } from '../../utils/index.js';
import type { SyncMode } from '../../workspace-unit';
import { MessageCenter } from '../../message/index.js';

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
  private _onTokenRefresh?: Callback = undefined;
  private _wsMap: Map<string, WebsocketProvider> = new Map();
  private _apis: Apis;
  private _channel?: WebsocketClient;
  // private _idbMap: Map<string, IndexedDBProvider> = new Map();

  constructor({ apis, ...params }: AffineProviderConstructorParams) {
    super(params);
    this._apis = apis || getApis();
  }

  override async init() {
    this._onTokenRefresh = () => {
      if (this._apis.token.refresh) {
        storage.setItem('token', this._apis.token.refresh);
      }
    };

    this._apis.token.onChange(this._onTokenRefresh);

    // initial login token
    if (this._apis.token.isExpired) {
      try {
        const refreshToken = storage.getItem('token');
        await this._apis.token.refreshToken(refreshToken);

        if (this._apis.token.refresh) {
          storage.set('token', this._apis.token.refresh);
        }

        assert(this._apis.token.isLogin);
      } catch (_) {
        // this._logger('Authorization failed, fallback to local mode');
      }
    } else {
      storage.setItem('token', this._apis.token.refresh);
    }

    if (token.isLogin) {
      this._connectChannel();
    }
  }

  private _connectChannel() {
    if (!this._channel) {
      this._channel = new WebsocketClient(
        `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${
          window.location.host
        }/api/global/sync/`,
        this._logger,
        {
          params: {
            token: this._apis.token.refresh,
          },
        }
      );
    }
    this._channel.on('message', (msg: ChannelMessage) => {
      this._handlerAffineListMessage(msg);
    });
  }

  private async _handlerAffineListMessage({
    ws_details,
    metadata,
  }: ChannelMessage) {
    this._logger('receive server message');
    const addedWorkspaces: WorkspaceUnit[] = [];
    const removeWorkspaceList = this._workspaces.list().map(w => w.id);
    for (const [id, detail] of Object.entries(ws_details)) {
      const { name, avatar } = metadata[id];
      const index = removeWorkspaceList.indexOf(id);
      if (index !== -1) {
        removeWorkspaceList.splice(index, 1);
      }
      assert(name);
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
        const workspaceUnit = await loadWorkspaceUnit(
          { id, ...workspace },
          this._apis
        );
        addedWorkspaces.push(workspaceUnit);
      }
    }
    // add workspaces
    this._workspaces.add(addedWorkspaces);
    // remove workspaces
    this._workspaces.remove(removeWorkspaceList);
  }

  private _getWebsocketProvider(workspace: BlocksuiteWorkspace) {
    const { doc, room } = workspace;
    assert(room);
    assert(doc);
    let ws = this._wsMap.get(room);
    if (!ws) {
      const wsUrl = `${
        window.location.protocol === 'https:' ? 'wss' : 'ws'
      }://${window.location.host}/api/sync/`;
      ws = new WebsocketProvider(wsUrl, room, doc, {
        params: { token: this._apis.token.refresh },
      });
      this._wsMap.set(room, ws);
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
    await this._applyCloudUpdates(workspace);
    const { room } = workspace;
    assert(room);
    this.linkLocal(workspace);
    const ws = this._getWebsocketProvider(workspace);
    // close all websocket links
    Array.from(this._wsMap.entries()).forEach(([id, ws]) => {
      if (id !== room) {
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
    if (!this._apis.token.isLogin) {
      return [];
    }
    const workspacesList = await this._apis.getWorkspaces();
    const workspaceUnits = await Promise.all(
      workspacesList.map(w => {
        return loadWorkspaceUnit(
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
      })
    );
    this._workspaces.add(workspaceUnits);
    return workspaceUnits;
  }

  override async auth() {
    const refreshToken = await storage.getItem('token');
    if (refreshToken) {
      await this._apis.token.refreshToken(refreshToken);
      if (this._apis.token.isLogin && !this._apis.token.isExpired) {
        // login success
        return;
      }
    }
    const user = await this._apis.signInWithGoogle?.();
    if (!this._channel?.connected) {
      this._connectChannel();
    }
    if (!user) {
      this._sendMessage(MessageCenter.messageCode.loginError);
    }
  }

  public override async getUserInfo(): Promise<User | undefined> {
    const user = this._apis.token.user;
    await this.init;
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
    const ws = this._wsMap.get(id);
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
    const { id } = await this._apis.createWorkspace(meta);

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

    await syncToCloud(
      workspaceUnit.blocksuiteWorkspace!,
      this._apis.token.refresh
    );
    this._workspaces.add(workspaceUnit);

    return workspaceUnit;
  }

  public override async publish(id: string, isPublish: boolean): Promise<void> {
    await this._apis.updateWorkspace({ id, public: isPublish });
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
    const { id } = await this._apis.createWorkspace({
      name: workspaceUnit.name,
    });
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

    const blocksuiteWorkspace = createBlocksuiteWorkspace(id);
    assert(workspaceUnit.blocksuiteWorkspace);
    await applyUpdate(
      blocksuiteWorkspace,
      encodeStateAsUpdate(workspaceUnit.blocksuiteWorkspace.doc)
    );

    await syncToCloud(blocksuiteWorkspace, this._apis.token.refresh);

    newWorkspaceUnit.setBlocksuiteWorkspace(blocksuiteWorkspace);

    this._workspaces.add(newWorkspaceUnit);
    return newWorkspaceUnit;
  }

  public override async logout(): Promise<void> {
    token.clear();
    this._channel?.disconnect();
    this._wsMap.forEach(ws => ws.disconnect());
    storage.removeItem('token');
  }

  public override async getWorkspaceMembers(id: string) {
    return this._apis.getWorkspaceMembers({ id });
  }

  public override async acceptInvitation(invitingCode: string) {
    return await this._apis.acceptInviting({ invitingCode });
  }
}
