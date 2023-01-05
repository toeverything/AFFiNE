import { uuidv4 } from '@blocksuite/store';
import { getDataCenter } from './../index';
import { DataCenter } from './../datacenter';
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

  /**
   * Get page list  by workspace id
   * @param {string} id ID of workspace.
   */
  getPagesByWorkspaceId(id: string) {
    return [];
  }

  /**
   * Observe the update of the workspace
   * @param {function} callback({Workspace[]}).
   */
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

  /**
   * The member of the workspace go to  leave workspace
   * @param {string} id ID of workspace.
   */
  async leaveWorkspace(id: string) {
    const dc = await this._getDc();
    const workspace = dc.workspacesList.getWorkspaces().find(w => w.id === id);
    if (workspace?.type === WorkspaceType.cloud) {
      dc.apis.leaveWorkspace({ id });
      dc.delete(id);
    }
  }

  /**
   * Let the workspace to be public
   * @param {string} id ID of workspace.
   * @param {string} isPublish publish flag of workspace.
   */
  setWorkspacePublish(id: string, isPublish: boolean): boolean {
    return isPublish;
  }

  /**
   * Get workspace by workspace id
   * @param {string} id ID of workspace.
   */
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
  /**
   * Get the members of the workspace
   * @param {string} id ID of workspace.
   */
  getMembers(id: string): any {
    void 0;
  }
  /**
   * Add a new member to the workspace
   * @param {string} id ID of workspace.
   * @param {string} email new member email.
   */
  inviteMember(id: string, email: string) {
    void 0;
  }

  async acceptInvitation(invitingCode: string) {
    const dc = await this._getDc();
    dc.apis.acceptInviting({ invitingCode });
  }

  // check with dark sky
  /**
   * Get login user info
   */
  getUserInfo() {
    void 0;
  }

  // TODO check with dark sky
  async login() {
    const dc = await this._getDc();
    await dc.auth('affine');
  }

  // just has no time
  /**
   * Logout and clear login session
   */
  logout() {
    void 0;
  }

  // need discuss
  /**
   * Create a connection between local and cloud, sync cloud data to local
   * @param {string} id ID of workspace.
   * @param {string} id type of workspace.
   */
  // setWorkspaceSyncType(id: string, type: 'local' | 'cloud') {}

  // need discuss
  /**
   * Select a file to import the workspace
   * @param {File} file file of workspace.
   */
  importWorkspace(file: File) {
    void 0;
  }

  // need discuss may be not in apis
  // /**
  //  * Generate a file ,and export it to local file system
  //  * @param {string} id ID of workspace.
  //  */
  exportWorkspace(id: string) {
    void 0;
  }

  // need discuss
  // /**
  //  * Enable workspace cloud flag
  //  * @param {string} id ID of workspace.
  //  */
  enableWorkspaceCloud(id: string) {
    void 0;
  }
}
