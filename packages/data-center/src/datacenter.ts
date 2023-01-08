import { Workspaces } from './workspaces';
import { Workspace } from '@blocksuite/store';
import { BaseProvider } from './provider/base';
import { LocalProvider } from './provider/local/local';
import { AffineProvider } from './provider';
import { Workspace as WS, WorkspaceMeta } from 'src/types';
import assert from 'assert';
import { getLogger } from './logger';
import { BlockSchema } from '@blocksuite/blocks/models';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

/**
 * @class DataCenter
 * @classdesc DataCenter is a data center, it can manage different providers for business
 */
export class DataCenter {
  private readonly workspaces = new Workspaces(this);
  private currentWorkspace: Workspace | null = null;
  private readonly _logger = getLogger('dc');
  providerMap: Map<string, BaseProvider> = new Map();

  constructor(debug: boolean) {
    this._logger.enabled = debug;
  }

  static async init(debug: boolean): Promise<DataCenter> {
    const dc = new DataCenter(debug);
    // TODO: switch different provider
    dc.registerProvider(new LocalProvider());
    dc.registerProvider(new AffineProvider());
    dc.workspaces.init();

    return dc;
  }

  registerProvider(provider: BaseProvider) {
    // inject data in provider
    provider.inject({ logger: this._logger, workspaces: this.workspaces });
    provider.init();
    this.providerMap.set(provider.id, provider);
  }

  get providers() {
    return Array.from(this.providerMap.values());
  }

  /**
   * get workspaces list if focusUpdate is true, it will refresh workspaces
   * @param {string} name workspace name
   * @returns {Promise<WS[]>}
   */
  public async getWorkspaces(focusUpdate = false) {
    if (focusUpdate) {
      this.workspaces.refreshWorkspaces();
    }
    return this.workspaces.workspaces;
  }

  /**
   * create new workspace , new workspace is a local workspace
   * @param {string} name workspace name
   * @returns {Promise<WS>}
   */
  public async createWorkspace(name: string) {
    const workspaceInfo = this.workspaces.addLocalWorkspace(name);
    // IMP: create workspace in local provider
    this.providerMap.get('local')?.createWorkspace({ name });
    return workspaceInfo;
  }

  /**
   * delete workspace by id
   * @param {string} workspaceId workspace id
   */
  public async deleteWorkspace(workspaceId: string) {
    const workspaceInfo = this.workspaces.getWorkspace(workspaceId);
    assert(workspaceInfo, 'Workspace not found');
    const provider = this.providerMap.get(workspaceInfo.provider);
    if (provider && this.workspaces.hasWorkspace(workspaceId)) {
      await provider.delete(workspaceId);
      // may be refresh all workspaces
      this.workspaces.delete(workspaceId);
    }
  }

  /**
   * get a new workspace only has room id
   * @param {string} workspaceId workspace id
   */
  private _getWorkspace(workspaceId: string) {
    return new Workspace({
      room: workspaceId,
    }).register(BlockSchema);
  }

  /**
   * login to all providers, it will default run all auth ,
   *  maybe need a params to control which provider to auth
   */
  public async login() {
    this.providers.forEach(p => {
      // TODO: may be add params of auth
      p.auth();
    });
  }

  /**
   * logout from all providers
   */
  public async logout() {
    this.providers.forEach(p => {
      p.logout();
    });
  }

  /**
   * load workspace instance by id
   * @param {string} workspaceId workspace id
   * @returns {Promise<Workspace>}
   */
  public async loadWorkspace(workspaceId: string) {
    const workspaceInfo = this.workspaces.getWorkspace(workspaceId);
    assert(workspaceInfo, 'Workspace not found');
    const currentProvider = this.providerMap.get(workspaceInfo.provider);
    if (currentProvider) {
      currentProvider.close(workspaceId);
    }
    const provider = this.providerMap.get(workspaceInfo.provider);
    assert(provider, `provide '${workspaceInfo.provider}' is not registered`);
    this._logger(`Loading ${workspaceInfo.provider} workspace: `, workspaceId);
    const workspace = this._getWorkspace(workspaceId);
    this.currentWorkspace = await provider.warpWorkspace(workspace);
    return this.currentWorkspace;
  }

  /**
   * get user info by provider id
   * @param {string} providerId the provider name of workspace
   */
  public async getUserInfo(providerId = 'affine') {
    // XXX: maybe return all user info
    const provider = this.providerMap.get(providerId);
    assert(provider, `provide '${providerId}' is not registered`);
    return provider.getUserInfo();
  }

  /**
   * listen workspaces list change
   */
  public async onWorkspacesChange(callback: (workspaces: WS[]) => void) {
    this.workspaces.onWorkspacesChange(callback);
  }

  /**
   * change workspaces meta
   * @param {WorkspaceMeta} workspaceMeta workspace meta
   * @param {Workspace} workspace workspace instance
   */
  public async resetWorkspaceMeta(
    { name, avatar }: WorkspaceMeta,
    workspace?: Workspace
  ) {
    const w = workspace ?? this.currentWorkspace;
    assert(w?.room, 'No workspace to set meta');
    const update: Partial<WorkspaceMeta> = {};
    if (name) {
      w.doc.meta.setName(name);
      update.name = name;
    }
    if (avatar) {
      w.doc.meta.setAvatar(avatar);
      update.avatar = avatar;
    }
    this.workspaces.updateWorkspaceMeta(w.room, update);
  }

  /**
   *
   * leave workspace by id
   * @param id workspace id
   */
  public async leaveWorkspace(workspaceId: string) {
    const workspaceInfo = this.workspaces.getWorkspace(workspaceId);
    assert(workspaceInfo, 'Workspace not found');
    const provider = this.providerMap.get(workspaceInfo.provider);
    if (provider) {
      provider.close(workspaceId);
      provider.leave(workspaceId);
    }
  }

  public async setWorkspacePublish() {
    // TODO: set workspace publish
  }

  public async inviteMember(id: string, email: string) {
    const workspaceInfo = this.workspaces.getWorkspace(id);
    assert(workspaceInfo, 'Workspace not found');
    const provider = this.providerMap.get(workspaceInfo.provider);
    if (provider) {
      provider.invite(id, email);
    }
  }

  /**
   * remove the new member to the workspace
   * @param {number} permissionId permission id
   */
  public async removeMember(workspaceId: string, permissionId: number) {
    const workspaceInfo = this.workspaces.getWorkspace(workspaceId);
    assert(workspaceInfo, 'Workspace not found');
    const provider = this.providerMap.get(workspaceInfo.provider);
    if (provider) {
      provider.removeMember(permissionId);
    }
  }

  /**
   *
   * do close current workspace
   */
  public async closeCurrentWorkspace() {
    assert(this.currentWorkspace?.room, 'No workspace to close');
    const currentWorkspace = this.workspaces.getWorkspace(
      this.currentWorkspace.room
    );
    assert(currentWorkspace, 'Workspace not found');
    const provider = this.providerMap.get(currentWorkspace.provider);
    assert(provider, 'Provider not found');
    provider.close(currentWorkspace.id);
  }

  private async _transWorkspaceProvider(
    workspace: Workspace,
    providerId: string
  ) {
    assert(workspace.room, 'No workspace id');
    const workspaceInfo = this.workspaces.getWorkspace(workspace.room);
    assert(workspaceInfo, 'Workspace not found');
    if (workspaceInfo.provider === providerId) {
      this._logger('Workspace provider is same');
      return;
    }
    const currentProvider = this.providerMap.get(workspaceInfo.provider);
    assert(currentProvider, 'Provider not found');
    const newProvider = this.providerMap.get(providerId);
    assert(newProvider, `provide '${providerId}' is not registered`);
    this._logger(`create ${providerId} workspace: `, workspaceInfo.name);
    const newWorkspace = await newProvider.createWorkspace({
      name: workspaceInfo.name,
      avatar: workspaceInfo.avatar,
    });
    assert(newWorkspace, 'Create workspace failed');
    this._logger(
      `update workspace data from ${workspaceInfo.provider} to ${providerId}`
    );
    applyUpdate(newWorkspace.doc, encodeStateAsUpdate(workspace.doc));
    assert(newWorkspace, 'Create workspace failed');
    await currentProvider.delete(workspace.room);
    this.workspaces.refreshWorkspaces();
  }

  /**
   * Enable workspace cloud flag
   * @param {string} id ID of workspace.
   */
  public async enableWorkspaceCloud(
    workspace: Workspace | null = this.currentWorkspace
  ) {
    assert(workspace?.room, 'No workspace to enable cloud');
    return await this._transWorkspaceProvider(workspace, 'affine');
  }

  /**
   * Select a file to import the workspace
   * @param {File} file file of workspace.
   */
  public async importWorkspace(file: File) {
    file;
    return;
  }

  /**
   * Generate a file ,and export it to local file system
   * @param {string} id ID of workspace.
   */
  public async exportWorkspace(id: string) {
    id;
    return;
  }
}
