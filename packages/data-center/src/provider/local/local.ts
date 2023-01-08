import { BaseProvider } from '../base';
import { varStorage as storage } from 'lib0/storage';
import { Workspace as WS, WorkspaceMeta } from '../../types';
import { Workspace } from '@blocksuite/store';
import { IndexedDBProvider } from '../indexeddb';
import assert from 'assert';
import { getDefaultHeadImgBlob } from '../../utils';

const WORKSPACE_KEY = 'workspaces';

export class LocalProvider extends BaseProvider {
  public id = 'local';
  private _idbMap: Map<string, IndexedDBProvider> = new Map();
  private _workspacesList: WS[] = [];

  constructor() {
    super();
    this._workspacesList = [];
  }

  private _storeWorkspaces(workspaces: WS[]) {
    storage.setItem(WORKSPACE_KEY, JSON.stringify(workspaces));
  }

  private async _initWorkspaceDb(workspace: Workspace) {
    assert(workspace.room);
    let idb = this._idbMap.get(workspace.room);
    idb?.destroy();
    idb = new IndexedDBProvider(workspace.room, workspace.doc);
    this._idbMap.set(workspace.room, idb);
    this._logger('Local data loaded');
    return idb;
  }

  public override async warpWorkspace(
    workspace: Workspace
  ): Promise<Workspace> {
    assert(workspace.room);
    await this._initWorkspaceDb(workspace);
    return workspace;
  }

  override loadWorkspaces(): Promise<WS[]> {
    const workspaceStr = storage.getItem(WORKSPACE_KEY);
    let workspaces: WS[] = [];
    if (workspaceStr) {
      try {
        workspaces = JSON.parse(workspaceStr) as WS[];
      } catch (error) {
        this._logger(`Failed to parse workspaces from storage`);
      }
    }
    return Promise.resolve(workspaces);
  }

  public override async delete(id: string): Promise<void> {
    const index = this._workspacesList.findIndex(ws => ws.id === id);
    if (index !== -1) {
      IndexedDBProvider.delete(id);
      this._workspacesList.splice(index, 1);
      this._storeWorkspaces(this._workspacesList);
    } else {
      this._logger(`Failed to delete workspace ${id}`);
    }
  }

  public override async updateWorkspaceMeta(
    id: string,
    meta: Partial<WorkspaceMeta>
  ) {
    const index = this._workspacesList.findIndex(ws => ws.id === id);
    if (index !== -1) {
      const workspace = this._workspacesList[index];
      meta.name && (workspace.name = meta.name);
      meta.avatar && (workspace.avatar = meta.avatar);
      this._storeWorkspaces(this._workspacesList);
    } else {
      this._logger(`Failed to update workspace ${id}`);
    }
  }

  public override async createWorkspace(
    meta: WorkspaceMeta
  ): Promise<Workspace | undefined> {
    assert(meta.name, 'Workspace name is required');
    if (!meta.avatar) {
      // set default avatar
      const blob = await getDefaultHeadImgBlob(meta.name);
      meta.avatar = (await this.setBlob(blob)) || '';
    }
    const workspaceInfos = this._workspaces.addLocalWorkspace(meta.name);
    this._logger('Creating affine workspace');
    const workspace = new Workspace({ room: workspaceInfos.id });
    workspace.meta.setName(meta.name);
    workspace.meta.setAvatar(meta.avatar);
    this._storeWorkspaces([...this._workspacesList, workspaceInfos]);
    this._initWorkspaceDb(workspace);
    return workspace;
  }

  public override async clear(): Promise<void> {
    const workspaces = await this.loadWorkspaces();
    workspaces.forEach(ws => IndexedDBProvider.delete(ws.id));
    this._storeWorkspaces([]);
  }
}
