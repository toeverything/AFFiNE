import { BaseProvider } from '../base';
import { varStorage as storage } from 'lib0/storage';
import { Workspace as WS, WorkspaceMeta } from 'src/types';
import { Workspace } from '@blocksuite/store';
import { IndexedDBProvider } from '../indexeddb';
import assert from 'assert';

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
    return idb;
  }

  public override async warpWorkspace(
    workspace: Workspace
  ): Promise<Workspace> {
    assert(workspace.room);
    await this._initWorkspaceDb(workspace);
    return workspace;
  }

  override loadWorkspaces() {
    const workspaceStr = storage.getItem(WORKSPACE_KEY);
    if (workspaceStr) {
      try {
        return JSON.parse(workspaceStr);
      } catch (error) {
        this._logger(`Failed to parse workspaces from storage`);
      }
    }
    return [];
  }

  public override async delete(id: string): Promise<void> {
    const index = this._workspacesList.findIndex(ws => ws.id === id);
    if (index !== -1) {
      // TODO delete workspace all data
      this._workspacesList.splice(index, 1);
      this._storeWorkspaces(this._workspacesList);
    } else {
      this._logger(`Failed to delete workspace ${id}`);
    }
  }

  public override async createWorkspace(
    meta: WorkspaceMeta
  ): Promise<Workspace | undefined> {
    assert(meta.name, 'Workspace name is required');
    meta.avatar ?? (meta.avatar = '');
    const workspaceInfos = this._workspaces.addLocalWorkspace(meta.name);
    const workspace = new Workspace({ room: workspaceInfos.id });
    // TODO: add avatar
    this._storeWorkspaces([...this._workspacesList, workspaceInfos]);
    this._initWorkspaceDb(workspace);
    return workspace;
  }

  public override async clear(): Promise<void> {
    // TODO: clear all data
    this._storeWorkspaces([]);
  }
}
