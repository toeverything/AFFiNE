import { Workspace as WS } from '../types';

import { Observable } from 'lib0/observable';
import { uuidv4 } from '@blocksuite/store';
import { DataCenter } from '../datacenter';

export class Workspaces extends Observable<string> {
  private _workspaces: WS[];
  private readonly _dc: DataCenter;

  constructor(dc: DataCenter) {
    super();
    this._workspaces = [];
    this._dc = dc;
  }

  public init() {
    this._loadWorkspaces();
  }

  get workspaces() {
    return this._workspaces;
  }

  /**
   * emit when workspaces changed
   * @param {(workspace: WS[]) => void} cb
   */
  onWorkspacesChange(cb: (workspace: WS[]) => void) {
    this.on('change', cb);
  }

  private async _loadWorkspaces() {
    const providers = this._dc.providers;
    let workspaces: WS[] = [];
    providers.forEach(async p => {
      const pWorkspaces = await p.loadWorkspaces();
      workspaces = [...workspaces, ...pWorkspaces];
      this._updateWorkspaces([...workspaces, ...pWorkspaces]);
    });
  }

  /**
   * focus load all workspaces list
   */
  public async refreshWorkspaces() {
    this._loadWorkspaces();
  }

  private _updateWorkspaces(workspaces: WS[]) {
    this._workspaces = workspaces;
    this.emit('change', this._workspaces);
  }

  private _getDefaultWorkspace(name: string): WS {
    return {
      name,
      id: uuidv4(),
      isPublish: false,
      avatar: '',
      owner: undefined,
      isLocal: true,
      memberCount: 1,
      provider: 'local',
    };
  }

  /** add a local workspaces */
  public addLocalWorkspace(name: string) {
    const workspace = this._getDefaultWorkspace(name);
    this._updateWorkspaces([...this._workspaces, workspace]);
    return workspace;
  }

  /** delete a workspaces by id */
  public delete(id: string) {
    const index = this._workspaces.findIndex(w => w.id === id);
    if (index >= 0) {
      this._workspaces.splice(index, 1);
      this._updateWorkspaces(this._workspaces);
    }
  }

  /** get workspace info by id */
  public getWorkspace(id: string) {
    return this._workspaces.find(w => w.id === id);
  }

  /** check if workspace exists */
  public hasWorkspace(id: string) {
    return this._workspaces.some(w => w.id === id);
  }

  public updateWorkspaceMeta(id: string, meta: Partial<WS>) {
    const index = this._workspaces.findIndex(w => w.id === id);
    if (index >= 0) {
      this._workspaces[index] = { ...this._workspaces[index], ...meta };
      this._updateWorkspaces(this._workspaces);
    }
  }
}
