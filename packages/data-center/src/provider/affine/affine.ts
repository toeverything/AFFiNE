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
} from './apis/workspace';
import { BaseProvider } from '../base';
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

export class AffineProvider extends BaseProvider {
  public id = 'affine';
  private _workspacesCache: Map<string, Workspace> = new Map();
  private _onTokenRefresh?: Callback = undefined;
  private readonly _authorizer = getAuthorizer();
  private _user: User | undefined = undefined;
  private _wsMap: Map<string, WebsocketProvider> = new Map();
  private _idbMap: Map<string, IndexedDBProvider> = new Map();

  constructor() {
    super();
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
    this._initWorkspaceDb(workspace);
    const updates = await downloadWorkspace(room);
    if (updates) {
      await new Promise(resolve => {
        doc.once('update', resolve);
        applyUpdate(doc, new Uint8Array(updates));
      });
    }
    const ws = new WebsocketProvider('/', room, doc);
    this._wsMap.set(room, ws);
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
    await (
      await Promise.all(workspaceInstances)
    ).forEach((workspace, i) => {
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

  public override async delete(id: string): Promise<void> {
    // TODO delete workspace all local data
    await deleteWorkspace({ id });
  }

  public override async clear(): Promise<void> {
    // TODO: clear all workspaces source
    this._workspacesCache.clear();
  }

  public override async close(id: string) {
    const idb = this._idbMap.get(id);
    idb?.destroy();
    const ws = this._wsMap.get(id);
    ws?.disconnect();
  }

  public override async leave(id: string): Promise<void> {
    await leaveWorkspace({ id });
  }

  public override async invite(id: string, email: string): Promise<void> {
    return await inviteMember({ id, email });
  }

  public override async removeMember(permissionId: number): Promise<void> {
    return await removeMember({ permissionId });
  }

  private async _initWorkspaceDb(workspace: Workspace) {
    assert(workspace.room);
    let idb = this._idbMap.get(workspace.room);
    idb?.destroy();
    idb = new IndexedDBProvider(workspace.room, workspace.doc);
    this._idbMap.set(workspace.room, idb);
    await idb.whenSynced;
    return idb;
  }

  public override async createWorkspace(
    meta: WorkspaceMeta
  ): Promise<Workspace | undefined> {
    assert(meta.name, 'Workspace name is required');
    meta.avatar ?? (meta.avatar = '');
    const { id } = await createWorkspace(meta as Required<WorkspaceMeta>);
    const nw = new Workspace({
      room: id,
    }).register(BlockSchema);
    this._initWorkspaceDb(nw);
    this._logger('Local data loaded');
    return nw;
  }
}
