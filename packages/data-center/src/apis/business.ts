import { uuidv4 } from '@blocksuite/store';
import { getDataCenter } from 'src';
import { DataCenter } from 'src/datacenter';
import { Workspace, WorkspaceMeta, WorkspaceType } from '../style';
import { token } from './token';

export class Business {
  private _dc: DataCenter | undefined;

  private async _getDc() {
    if (!this._dc) {
      this._dc = await getDataCenter();
    }
    return this._dc;
  }

  async createWorkspace(
    name: string
  ): Promise<Pick<Workspace, 'id' | 'name' | 'avatar' | 'type'>> {
    let id = '';
    let type = WorkspaceType.local;
    if (token.isLogin) {
      // TODO: add default avatar
      const data = await this._dc?.apis.createWorkspace({ name, avatar: '' });
      id = data?.id || '';
      type = WorkspaceType.cloud;
      this._dc?.load(id, { providerId: 'affine' });
    } else {
      this._dc?.load(uuidv4(), { providerId: 'local' });
    }
    const newWorkspaces = (await this.getWorkspaces()).find(w => w.id === id);
    return {
      id: newWorkspaces?.id || '',
      name,
      avatar: '',
      type,
    };
  }

  // not think out a good way to update workspace meta
  // updateWorkspaceMeta(
  //   id: string,
  //   meta: { name?: string; avatar: Partial<WorkspaceMeta> }
  // ) {}

  async getWorkspaces(focusUpdated?: boolean): Promise<Workspace[]> {
    const dc = await this._getDc();
    if (focusUpdated) {
      await dc.workspacesList.refreshWorkspaceList();
    }
    return dc.workspacesList.getWorkspaces();
  }

  async onWorkspaceChange(cb: (workspaces: Workspace[]) => void) {
    const dc = await this._getDc();
    dc.workspacesList.on('change', cb);
  }

  async deleteWorkspace(id: string) {
    const dc = await this._getDc();
    const workspace = dc.workspacesList.getWorkspaces().find(w => w.id === id);
    if (workspace?.type === WorkspaceType.cloud) {
      dc.apis.deleteWorkspace({ id });
    }
    dc.delete(id);
  }

  async leaveWorkspace(id: string) {
    const dc = await this._getDc();
    const workspace = dc.workspacesList.getWorkspaces().find(w => w.id === id);
    if (workspace?.type === WorkspaceType.cloud) {
      dc.apis.leaveWorkspace({ id });
      dc.delete(id);
    }
  }

  setWorkspacePublish(id: string, isPublish: boolean): boolean {
    return isPublish;
  }

  async getWorkspaceById(id: string) {
    const dc = await this._getDc();
    const workspace = dc.workspacesList.getWorkspaces().find(w => w.id === id);
    if (workspace?.type === WorkspaceType.cloud) {
      return dc.load(id, { providerId: 'affine' });
    } else {
      return dc.load(id, { providerId: 'local' });
    }
  }

  // no time
  // getMembers(id: string): any {}

  // inviteMember(id: string, email: string) {}

  async acceptInvitation(invitingCode: string) {
    const dc = await this._getDc();
    dc.apis.acceptInviting({ invitingCode });
  }

  // check with dark sky
  // getUserInfo(): any {}

  // TODO check with dark sky
  async login() {
    const dc = await this._getDc();
    await dc.auth('affine');
  }

  // just has no time
  // logout() {}

  // need discuss
  // setWorkspaceSyncType(id: string, type: 'local' | 'cloud') {}

  // need discuss
  // importWorkspace(file: File) {}

  // need discuss may be not in apis
  // exportWorkspace(id: string) {}

  // need discuss
  // enableWorkspaceCloud(id: string) {}
}
