import { BaseProvider } from '../base.js';
import type {
  ProviderConstructorParams,
  WorkspaceMeta0,
  UpdateWorkspaceMetaParams,
  CreateWorkspaceInfoParams,
} from '../base';
import { varStorage as storage } from 'lib0/storage';
import { Workspace as BlocksuiteWorkspace, uuidv4 } from '@blocksuite/store';
import { IndexedDBProvider } from './indexeddb/indexeddb.js';
import { applyLocalUpdates } from './indexeddb/utils.js';
import assert from 'assert';
import { loadWorkspaceUnit, createWorkspaceUnit } from './utils.js';
import type { WorkspaceUnit } from '../../workspace-unit';

const WORKSPACE_KEY = 'workspaces';

export class LocalProvider extends BaseProvider {
  public id = 'local';
  private _idbMap: Map<string, IndexedDBProvider> = new Map();

  constructor(params: ProviderConstructorParams) {
    super(params);
  }

  private _storeWorkspaces(workspaceUnits: WorkspaceUnit[]) {
    storage.setItem(
      WORKSPACE_KEY,
      JSON.stringify(
        workspaceUnits.map(w => {
          return w.toJSON();
        })
      )
    );
  }

  public override async linkLocal(workspace: BlocksuiteWorkspace) {
    assert(workspace.room);
    let idb = this._idbMap.get(workspace.room);
    if (!idb) {
      idb = new IndexedDBProvider(workspace.room, workspace.doc);
    }
    this._idbMap.set(workspace.room, idb);
    this._logger('Local data loaded');
    return workspace;
  }

  public override async warpWorkspace(
    workspace: BlocksuiteWorkspace
  ): Promise<BlocksuiteWorkspace> {
    assert(workspace.room);
    await applyLocalUpdates(workspace);
    await this.linkLocal(workspace);
    return workspace;
  }

  override async loadWorkspaces(): Promise<WorkspaceUnit[]> {
    const workspaceStr = storage.getItem(WORKSPACE_KEY);
    if (workspaceStr) {
      try {
        const workspaceMetas = JSON.parse(workspaceStr) as WorkspaceMeta0[];
        const workspaceUnits = await Promise.all(
          workspaceMetas.map(meta => {
            return loadWorkspaceUnit(meta);
          })
        );
        this._workspaces.add(workspaceUnits);
        return workspaceUnits;
      } catch (error) {
        this._logger(`Failed to parse workspaces from storage`);
      }
    }
    return [];
  }

  public override async deleteWorkspace(id: string): Promise<void> {
    const workspace = this._workspaces.get(id);
    if (workspace) {
      IndexedDBProvider.delete(id);
      this._workspaces.remove(id);
      this._storeWorkspaces(this._workspaces.list());
    } else {
      this._logger(`Failed to delete workspace ${id}`);
    }
  }

  public override async updateWorkspaceMeta(
    id: string,
    meta: UpdateWorkspaceMetaParams
  ) {
    this._workspaces.update(id, meta);
    this._storeWorkspaces(this._workspaces.list());
  }

  public override async createWorkspace(
    meta: CreateWorkspaceInfoParams
  ): Promise<WorkspaceUnit | undefined> {
    const workspaceUnit = await createWorkspaceUnit({
      name: meta.name,
      id: uuidv4(),
      published: false,
      avatar: '',
      owner: undefined,
      syncMode: 'core',
      memberCount: 1,
      provider: this.id,
    });
    this._workspaces.add(workspaceUnit);
    this._storeWorkspaces(this._workspaces.list());
    return workspaceUnit;
  }

  public override async clear(): Promise<void> {
    const workspaces = await this.loadWorkspaces();
    workspaces.forEach(ws => IndexedDBProvider.delete(ws.id));
    this._storeWorkspaces([]);
    this._workspaces.clear();
  }
}
