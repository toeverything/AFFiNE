import { BaseProvider } from '../base.js';
import type { ProviderConstructorParams } from '../base';
import type { User, WorkspaceInfo, WorkspaceMeta } from '../../types';
import { Workspace as BlocksuiteWorkspace } from '@blocksuite/store';
import { BlockSchema } from '@blocksuite/blocks/models';
import { applyUpdate } from 'yjs';
import { storage } from './storage.js';
import assert from 'assert';
import { WebsocketProvider } from './sync.js';
// import { IndexedDBProvider } from '../local/indexeddb';
import { getDefaultHeadImgBlob } from '../../utils/index.js';
import { getApis } from './apis/index.js';
import type { Apis, WorkspaceDetail, Callback } from './apis';

export interface AffineProviderConstructorParams
  extends ProviderConstructorParams {
  apis?: Apis;
}

export class AffineProvider extends BaseProvider {
  public id = 'affine';
  private _workspacesCache: Map<string, BlocksuiteWorkspace> = new Map();
  private _onTokenRefresh?: Callback = undefined;
  private _wsMap: Map<string, WebsocketProvider> = new Map();
  private _apis: Apis;
  // private _idbMap: Map<string, IndexedDBProvider> = new Map();

  constructor({ apis, ...params }: AffineProviderConstructorParams) {
    super(params);
    this._apis = apis || getApis();
    this.init().then(() => {
      if (this._apis.token.isLogin) {
        this.loadWorkspaces();
      }
    });
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
  }

  override async warpWorkspace(workspace: BlocksuiteWorkspace) {
    const { doc, room } = workspace;
    assert(room);
    this.linkLocal(workspace);
    const updates = await this._apis.downloadWorkspace(room);
    if (updates && updates.byteLength) {
      await new Promise(resolve => {
        doc.once('update', resolve);
        applyUpdate(doc, new Uint8Array(updates));
      });
    }
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
    const workspaces: WorkspaceInfo[] = workspacesList.map(w => {
      return {
        ...w,
        memberCount: 0,
        name: '',
        provider: 'affine',
      };
    });
    const workspaceInstances = workspaces.map(({ id }) => {
      const workspace =
        this._workspacesCache.get(id) ||
        new BlocksuiteWorkspace({
          room: id,
        }).register(BlockSchema);
      this._workspacesCache.set(id, workspace);
      if (workspace) {
        return new Promise<BlocksuiteWorkspace>(resolve => {
          this._apis.downloadWorkspace(id).then(data => {
            applyUpdate(workspace.doc, new Uint8Array(data));
            resolve(workspace);
          });
        });
      } else {
        return Promise.resolve(null);
      }
    });

    (await Promise.all(workspaceInstances)).forEach((workspace, i) => {
      if (workspace) {
        workspaces[i] = {
          ...workspaces[i],
          name: workspace.doc.meta.name,
          avatar: workspace.doc.meta.avatar,
        };
      }
    });
    const getDetailList = workspacesList.map(w => {
      const { id } = w;
      return new Promise<{ id: string; detail: WorkspaceDetail | null }>(
        resolve => {
          this._apis.getWorkspaceDetail({ id }).then(data => {
            resolve({ id, detail: data || null });
          });
        }
      );
    });
    const ownerList = await Promise.all(getDetailList);
    (await Promise.all(ownerList)).forEach(detail => {
      if (detail) {
        const { id, detail: workspaceDetail } = detail;
        if (workspaceDetail) {
          const { owner, member_count } = workspaceDetail;
          const currentWorkspace = workspaces.find(w => w.id === id);
          if (currentWorkspace) {
            currentWorkspace.owner = {
              id: owner.id,
              name: owner.name,
              avatar: owner.avatar_url,
              email: owner.email,
            };
            currentWorkspace.memberCount = member_count;
          }
        }
      }
    });

    workspaces.forEach(workspace => {
      this._workspaces.add(workspace);
    });

    return workspaces;
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
    await this._apis.signInWithGoogle?.();
  }

  public override async getUserInfo(): Promise<User | undefined> {
    const user = this._apis.token.user;
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
    for (const w of this._workspacesCache.values()) {
      if (w.room) {
        try {
          await this.deleteWorkspace(w.room);
          this._workspaces.remove(w.room);
        } catch (e) {
          this._logger('has a problem of delete workspace ', e);
        }
      }
    }
    this._workspacesCache.clear();
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
    meta: WorkspaceMeta
  ): Promise<BlocksuiteWorkspace | undefined> {
    assert(meta.name, 'Workspace name is required');
    const { id } = await this._apis.createWorkspace(
      meta as Required<WorkspaceMeta>
    );
    this._logger('Creating affine workspace');
    const nw = new BlocksuiteWorkspace({
      room: id,
    }).register(BlockSchema);
    const { doc } = nw;
    const updates = await this._apis.downloadWorkspace(id);
    if (updates && updates.byteLength) {
      await new Promise(resolve => {
        doc.once('update', resolve);
        applyUpdate(doc, new Uint8Array(updates));
      });
    }
    // nw.meta.setName(meta.name);
    this.linkLocal(nw);

    const workspaceInfo: WorkspaceInfo = {
      name: meta.name,
      id,
      isPublish: false,
      avatar: '',
      owner: undefined,
      isLocal: true,
      memberCount: 1,
      provider: 'affine',
    };

    if (!meta.avatar) {
      // set default avatar
      const blob = await getDefaultHeadImgBlob(meta.name);
      const blobStorage = await nw.blobs;
      assert(blobStorage, 'No blob storage');
      const blobId = await blobStorage.set(blob);
      const avatar = await blobStorage.get(blobId);
      if (avatar) {
        nw.meta.setAvatar(avatar);
        workspaceInfo.avatar = avatar;
      }
    }
    this._workspaces.add(workspaceInfo);
    return nw;
  }

  public override async publish(id: string, isPublish: boolean): Promise<void> {
    await this._apis.updateWorkspace({ id, public: isPublish });
  }

  public override async getUserByEmail(
    workspace_id: string,
    email: string
  ): Promise<User | null> {
    const user = await this._apis.getUserByEmail({ workspace_id, email });
    return user
      ? {
          id: user.id,
          name: user.name,
          avatar: user.avatar_url,
          email: user.email,
        }
      : null;
  }
}
