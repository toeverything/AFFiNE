import {
  getWorkspaces,
  getWorkspaceDetail,
  WorkspaceDetail,
  downloadWorkspace,
  deleteWorkspace,
  leaveWorkspace,
  inviteMember,
  removeMember,
  createWorkspace,
  updateWorkspace,
} from './apis/workspace';
import { BaseProvider } from '../base';
import type { ProviderConstructorParams } from '../base';
import { User, Workspace as WS, WorkspaceMeta } from '../../types';
import { Workspace } from '@blocksuite/store';
import { BlockSchema } from '@blocksuite/blocks/models';
import { applyUpdate } from 'yjs';
import { token, Callback } from './apis';
import { varStorage as storage } from 'lib0/storage';
import assert from 'assert';
import { getAuthorizer } from './apis/token';
import { WebsocketProvider } from './sync';
import { IndexedDBProvider } from '../indexeddb';
import { getDefaultHeadImgBlob } from '../../utils';
import { getUserByEmail } from './apis/user';

export class AffineProvider extends BaseProvider {
  public id = 'affine';
  private _workspacesCache: Map<string, Workspace> = new Map();
  private _onTokenRefresh?: Callback = undefined;
  private readonly _authorizer = getAuthorizer();
  private _user: User | undefined = undefined;
  private _wsMap: Map<string, WebsocketProvider> = new Map();
  private _idbMap: Map<string, IndexedDBProvider> = new Map();

  constructor(params: ProviderConstructorParams) {
    super(params);
  }

  override async init() {
    this._onTokenRefresh = () => {
      if (token.refresh) {
        storage.setItem('token', token.refresh);
      }
    };

    token.onChange(this._onTokenRefresh);

    // initial login token
    if (token.isExpired) {
      try {
        const refreshToken = storage.getItem('token');
        await token.refreshToken(refreshToken);

        if (token.refresh) {
          storage.set('token', token.refresh);
        }

        assert(token.isLogin);
      } catch (_) {
        // this._logger('Authorization failed, fallback to local mode');
      }
    } else {
      storage.setItem('token', token.refresh);
    }
  }

  override async warpWorkspace(workspace: Workspace) {
    const { doc, room } = workspace;
    assert(room);
    this.linkLocal(workspace);
    const updates = await downloadWorkspace(room);
    if (updates) {
      await new Promise(resolve => {
        doc.once('update', resolve);
        applyUpdate(doc, new Uint8Array(updates));
      });
    }
    let ws = this._wsMap.get(room);
    if (!ws) {
      ws = new WebsocketProvider('/', room, doc);
      this._wsMap.set(room, ws);
    }
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
    if (!token.isLogin) {
      return [];
    }
    const workspacesList = await getWorkspaces();
    const workspaces: WS[] = workspacesList.map(w => {
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
        new Workspace({
          room: id,
        }).register(BlockSchema);
      this._workspacesCache.set(id, workspace);
      if (workspace) {
        return new Promise<Workspace>(resolve => {
          downloadWorkspace(id).then(data => {
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
          getWorkspaceDetail({ id }).then(data => {
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
      await token.refreshToken(refreshToken);
      if (token.isLogin && !token.isExpired) {
        // login success
        return;
      }
    }
    const user = await this._authorizer[0]?.();
    assert(user);
    this._user = {
      id: user.id,
      name: user.name,
      avatar: user.avatar_url,
      email: user.email,
    };
  }

  public override async getUserInfo(): Promise<User | undefined> {
    return this._user;
  }

  public override async deleteWorkspace(id: string): Promise<void> {
    await this.closeWorkspace(id);
    IndexedDBProvider.delete(id);
    await deleteWorkspace({ id });
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
    const idb = this._idbMap.get(id);
    idb?.destroy();
    const ws = this._wsMap.get(id);
    ws?.disconnect();
  }

  public override async leaveWorkspace(id: string): Promise<void> {
    await leaveWorkspace({ id });
  }

  public override async invite(id: string, email: string): Promise<void> {
    return await inviteMember({ id, email });
  }

  public override async removeMember(permissionId: number): Promise<void> {
    return await removeMember({ permissionId });
  }

  public override async linkLocal(workspace: Workspace) {
    assert(workspace.room);
    let idb = this._idbMap.get(workspace.room);
    idb?.destroy();
    idb = new IndexedDBProvider(workspace.room, workspace.doc);
    this._idbMap.set(workspace.room, idb);
    await idb.whenSynced;
    this._logger('Local data loaded');
    return workspace;
  }

  public override async createWorkspace(
    meta: WorkspaceMeta
  ): Promise<Workspace | undefined> {
    assert(meta.name, 'Workspace name is required');
    const { id } = await createWorkspace(meta as Required<WorkspaceMeta>);
    this._logger('Creating affine workspace');
    const nw = new Workspace({
      room: id,
    }).register(BlockSchema);
    nw.meta.setName(meta.name);
    this.linkLocal(nw);

    const workspaceInfo: WS = {
      name: meta.name,
      id,
      isPublish: false,
      avatar: '',
      owner: undefined,
      isLocal: true,
      memberCount: 1,
      provider: 'local',
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
    await updateWorkspace({ id, public: isPublish });
  }

  public override async getUserByEmail(
    workspace_id: string,
    email: string
  ): Promise<User | null> {
    const user = await getUserByEmail({ workspace_id, email });
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
