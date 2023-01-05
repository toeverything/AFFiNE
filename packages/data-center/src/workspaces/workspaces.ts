import { Workspace } from '@blocksuite/store';
import { Observable } from 'lib0/observable';
import { WorkspaceDetail } from 'src/apis/workspace';
import { DataCenter } from './../datacenter';
import { User, Workspace as Wp, WorkspaceType } from './../style';

function getProvider(providerList: Record<string, boolean>) {
  return Object.keys(providerList)[0];
}

function isCloudWorkspace(provider: string) {
  return provider === 'affine';
}

export class Workspaces extends Observable<string> {
  private _workspaces: Wp[];
  private readonly workspaceInstances: Map<string, Workspace> = new Map();
  // cache cloud workspace owner
  _dc: DataCenter;

  constructor(dataCenter: DataCenter) {
    super();
    this._workspaces = [];
    this.workspaceInstances = new Map();
    this._dc = dataCenter;
  }

  init() {
    // IMP: init local providers
    this._dc.auth('local');
    // add listener on list change
    this._dc.signals.listAdd.on(e => {
      this.refreshWorkspaceList();
    });
    this._dc.signals.listRemove.on(e => {
      this.refreshWorkspaceList();
    });
  }

  async refreshWorkspaceList() {
    const workspaceList = await this._dc.list();

    const workspaceMap = Object.keys(workspaceList).map(([id]) => {
      return this._dc.load(id).then(w => {
        return { id, workspace: w, provider: getProvider(workspaceList[id]) };
      });
    });

    const workspaces = (await Promise.all(workspaceMap)).map(w => {
      const { id, workspace, provider } = w;
      if (workspace && !this.workspaceInstances.has(id)) {
        this.workspaceInstances.set(id, workspace);
      }
      return {
        id,
        name: (workspace?.doc?.meta.name as string) || '',
        avatar: (workspace?.meta.avatar as string) || '',
        type: isCloudWorkspace(provider)
          ? WorkspaceType.cloud
          : WorkspaceType.local,
        isLocal: false,
        isPublish: false,
        owner: undefined,
        memberCount: 1,
      } as Wp;
    });
    const getDetailList = (await Promise.all(workspaceMap)).map(w => {
      const { id, provider } = w;
      if (provider === 'workspaces') {
        return new Promise<{ id: string; detail: WorkspaceDetail | null }>(
          resolve => {
            this._dc.apis.getWorkspaceDetail({ id }).then(data => {
              resolve({ id, detail: data || null });
            });
          }
        );
      }
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
    this._updateWorkspaces(workspaces);
  }

  getWorkspaces() {
    return this._workspaces;
  }

  _updateWorkspaces(workspaces: Wp[]) {
    this._workspaces = workspaces;
    this.emit('change', this._workspaces);
  }

  onWorkspaceChange(cb: (workspace: Wp) => void) {
    this.on('change', cb);
  }
}
