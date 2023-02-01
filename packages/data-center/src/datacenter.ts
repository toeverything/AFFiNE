import { WorkspaceUnitCollection } from './workspace-unit-collection.js';
import type { WorkspaceUnitCollectionChangeEvent } from './workspace-unit-collection';
import { Workspace as BlocksuiteWorkspace } from '@blocksuite/store';
import type {
  BaseProvider,
  CreateWorkspaceInfoParams,
  UpdateWorkspaceMetaParams,
} from './provider/base';
import { LocalProvider } from './provider/local/local';
import { AffineProvider } from './provider';
import type { Message } from './types';
import assert from 'assert';
import { getLogger } from './logger';
import { createBlocksuiteWorkspace } from './utils/index.js';
import { MessageCenter } from './message';
import { WorkspaceUnit } from './workspace-unit';

/**
 * @class DataCenter
 * @classdesc Data center is made for managing different providers for business
 */
export class DataCenter {
  private readonly _workspaceUnitCollection = new WorkspaceUnitCollection();
  private readonly _logger = getLogger('dc');
  private _workspaceInstances: Map<string, BlocksuiteWorkspace> = new Map();
  private _messageCenter = MessageCenter.getInstance();
  /**
   * A mainProvider must exist as the only data trustworthy source.
   */
  private _mainProvider?: BaseProvider;
  providerMap: Map<string, BaseProvider> = new Map();

  constructor(debug: boolean) {
    this._logger.enabled = debug;
  }

  static async init(debug: boolean): Promise<DataCenter> {
    const dc = new DataCenter(debug);
    const getInitParams = () => {
      return {
        logger: dc._logger,
        workspaces: dc._workspaceUnitCollection.createScope(),
        messageCenter: dc._messageCenter,
      };
    };
    // TODO: switch different provider
    await dc.registerProvider(new LocalProvider(getInitParams()));
    await dc.registerProvider(new AffineProvider(getInitParams()));

    for (const provider of dc.providerMap.values()) {
      await provider.loadWorkspaces();
    }

    return dc;
  }

  /**
   * Register provider.
   * We will automatically set the first provider to default provider.
   */
  async registerProvider(provider: BaseProvider) {
    if (!this._mainProvider) {
      this._mainProvider = provider;
    }

    await provider.init();
    this.providerMap.set(provider.id, provider);
  }

  setMainProvider(providerId: string) {
    this._mainProvider = this.providerMap.get(providerId);
  }

  get providers() {
    return Array.from(this.providerMap.values());
  }

  public get workspaces() {
    return this._workspaceUnitCollection.workspaces;
  }

  public async refreshWorkspaces() {
    return Promise.allSettled(
      Object.values(this.providerMap).map(provider => provider.loadWorkspaces())
    );
  }

  /**
   * create new workspace , new workspace is a local workspace
   * @param {string} name workspace name
   * @returns {Promise<Workspace>}
   */
  public async createWorkspace(params: CreateWorkspaceInfoParams) {
    assert(
      this._mainProvider,
      'There is no provider. You should add provider first.'
    );

    const workspaceUnit = await this._mainProvider.createWorkspace(params);
    return workspaceUnit;
  }

  /**
   * delete workspace by id
   * @param {string} workspaceId workspace id
   */
  public async deleteWorkspace(workspaceId: string) {
    const workspaceInfo = this._workspaceUnitCollection.find(workspaceId);
    assert(workspaceInfo, 'Workspace not found');
    const provider = this.providerMap.get(workspaceInfo.provider);
    assert(provider, `Workspace exists, but we couldn't find its provider.`);
    await provider.deleteWorkspace(workspaceId);
  }

  /**
   * get a new workspace only has room id
   * @param {string} workspaceId workspace id
   */
  private _getBlocksuiteWorkspace(workspaceId: string) {
    // const workspaceInfo = this._workspaceUnitCollection.find(workspaceId);
    // assert(workspaceInfo, 'Workspace not found');
    return (
      // this._workspaceInstances.get(workspaceId) ||
      createBlocksuiteWorkspace(workspaceId)
    );
  }

  /**
   * login to all providers, it will default run all auth ,
   *  maybe need a params to control which provider to auth
   */
  public async login(providerId = 'affine') {
    const provider = this.providerMap.get(providerId);
    assert(provider, `provide '${providerId}' is not registered`);
    await provider.auth();
    provider.loadWorkspaces();
  }

  /**
   * logout from all providers
   */
  public async logout(providerId = 'affine') {
    const provider = this.providerMap.get(providerId);
    assert(provider, `provide '${providerId}' is not registered`);
    await provider.logout();
  }

  /**
   * load workspace instance by id
   * @param {string} workspaceId workspace id
   * @returns {Promise<WorkspaceUnit>}
   */
  public async loadWorkspace(
    workspaceId: string
  ): Promise<WorkspaceUnit | null> {
    const workspaceUnit = this._workspaceUnitCollection.find(workspaceId);
    assert(workspaceUnit, 'Workspace not found');
    const currentProvider = this.providerMap.get(workspaceUnit.provider);
    if (currentProvider) {
      currentProvider.closeWorkspace(workspaceId);
    }
    const provider = this.providerMap.get(workspaceUnit.provider);
    assert(provider, `provide '${workspaceUnit.provider}' is not registered`);
    this._logger(`Loading ${workspaceUnit.provider} workspace: `, workspaceId);
    const workspace = this._getBlocksuiteWorkspace(workspaceId);
    this._workspaceInstances.set(workspaceId, workspace);
    await provider.warpWorkspace(workspace);
    this._workspaceUnitCollection.workspaces.forEach(workspaceUnit => {
      const provider = this.providerMap.get(workspaceUnit.provider);
      assert(provider);
      provider.closeWorkspace(workspaceUnit.id);
    });
    workspaceUnit.setBlocksuiteWorkspace(workspace);
    return workspaceUnit;
  }

  public async loadPublicWorkspace(workspaceId: string) {
    // FIXME: hard code for public workspace
    const provider = this.providerMap.get('affine');
    assert(provider);
    const blocksuiteWorkspace = this._getBlocksuiteWorkspace(workspaceId);
    await provider.loadPublicWorkspace(blocksuiteWorkspace);

    const workspaceUnitForPublic = new WorkspaceUnit({
      id: workspaceId,
      name: blocksuiteWorkspace.meta.name,
      avatar: blocksuiteWorkspace.meta.avatar,
      owner: undefined,
      published: true,
      provider: 'affine',
      memberCount: 1,
      syncMode: 'core',
    });

    workspaceUnitForPublic.setBlocksuiteWorkspace(blocksuiteWorkspace);
    return workspaceUnitForPublic;
  }

  /**
   * get user info by provider id
   * @param {string} providerId the provider name of workspace
   * @returns {Promise<User>}
   */
  public async getUserInfo(providerId = 'affine') {
    // XXX: maybe return all user info
    const provider = this.providerMap.get(providerId);
    assert(provider, `provide '${providerId}' is not registered`);
    return provider.getUserInfo();
  }

  /**
   * listen workspaces list change
   * @param {Function} callback callback function
   */
  public async onWorkspacesChange(
    callback: (workspaces: WorkspaceUnitCollectionChangeEvent) => void,
    { immediate = true }: { immediate?: boolean } = {}
  ) {
    if (immediate) {
      callback({
        added: this._workspaceUnitCollection.workspaces,
      });
    }
    this._workspaceUnitCollection.on('change', callback);
  }

  /**
   * change workspaces meta
   * @param {WorkspaceMeta} workspaceMeta workspace meta
   * @param {WorkspaceUnit} workspace workspace instance
   */
  public async updateWorkspaceMeta(
    { name, avatar }: UpdateWorkspaceMetaParams,
    workspaceUnit: WorkspaceUnit
  ) {
    assert(workspaceUnit?.id, 'No workspace to set meta');
    const workspace = workspaceUnit.blocksuiteWorkspace;
    assert(workspace);
    const update: Partial<UpdateWorkspaceMetaParams> = {};
    if (name) {
      workspace.meta.setName(name);
      update.name = name;
    }
    if (avatar) {
      workspace.meta.setAvatar(avatar);
      update.avatar = avatar;
    }
    // may run for change workspace meta
    const workspaceInfo = this._workspaceUnitCollection.find(workspaceUnit.id);
    assert(workspaceInfo, 'Workspace not found');
    const provider = this.providerMap.get(workspaceInfo.provider);
    provider?.updateWorkspaceMeta(workspaceUnit.id, update);
  }

  /**
   *
   * leave workspace by id
   * @param id workspace id
   */
  public async leaveWorkspace(workspaceId: string) {
    const workspaceInfo = this._workspaceUnitCollection.find(workspaceId);
    assert(workspaceInfo, 'Workspace not found');
    const provider = this.providerMap.get(workspaceInfo.provider);
    if (provider) {
      await provider.closeWorkspace(workspaceId);
      await provider.leaveWorkspace(workspaceId);
    }
  }

  public async setWorkspacePublish(workspaceId: string, isPublish: boolean) {
    const workspaceInfo = this._workspaceUnitCollection.find(workspaceId);
    assert(workspaceInfo, 'Workspace not found');
    const provider = this.providerMap.get(workspaceInfo.provider);
    if (provider) {
      await provider.publish(workspaceId, isPublish);
    }
  }

  /**
   * invite the new member to the workspace
   * @param {string} workspaceId workspace id
   * @param {string} email
   */
  public async inviteMember(workspaceId: string, email: string) {
    const workspaceInfo = this._workspaceUnitCollection.find(workspaceId);
    assert(workspaceInfo, 'Workspace not found');
    const provider = this.providerMap.get(workspaceInfo.provider);
    if (provider) {
      await provider.invite(workspaceId, email);
    }
  }

  /**
   * remove the new member to the workspace
   * @param {number} permissionId permission id
   */
  public async removeMember(workspaceId: string, permissionId: number) {
    const workspaceInfo = this._workspaceUnitCollection.find(workspaceId);
    assert(workspaceInfo, 'Workspace not found');
    const provider = this.providerMap.get(workspaceInfo.provider);
    if (provider) {
      await provider.removeMember(permissionId);
    }
  }

  /**
   * get user info by email
   * @param workspaceId
   * @param email
   * @param provider
   * @returns {Promise<User>} User info
   */
  public async getUserByEmail(
    workspaceId: string,
    email: string,
    provider = 'affine'
  ) {
    const providerInstance = this.providerMap.get(provider);
    if (providerInstance) {
      return await providerInstance.getUserByEmail(workspaceId, email);
    }
  }

  public async enableProvider(
    workspaceUnit: WorkspaceUnit,
    providerId = 'affine'
  ) {
    if (workspaceUnit.provider === providerId) {
      this._logger('Workspace provider is same');
      return;
    }
    const provider = this.providerMap.get(providerId);
    assert(provider);
    const newWorkspaceUnit = await provider.extendWorkspace(workspaceUnit);

    // Currently we only allow enable one provider, so after enable new provider,
    // delete the old workspace from its provider.
    const oldProvider = this.providerMap.get(workspaceUnit.provider);
    assert(oldProvider);
    await oldProvider.deleteWorkspace(workspaceUnit.id);

    return newWorkspaceUnit;
  }

  /**
   * Enable workspace cloud
   * @param {string} id ID of workspace.
   */
  public async enableWorkspaceCloud(workspaceUnit: WorkspaceUnit) {
    return this.enableProvider(workspaceUnit);
  }

  /**
   * @deprecated
   * clear all workspaces and data
   */
  public async clear() {
    for (const provider of this.providerMap.values()) {
      await provider.clear();
    }
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

  /**
   * get blob url by workspaces id
   * @param id
   * @returns {Promise<string | null>} blob url
   */
  async getBlob(
    workspaceUnit: WorkspaceUnit,
    id: string
  ): Promise<string | null> {
    const blob = await workspaceUnit.blocksuiteWorkspace?.blobs;
    return (await blob?.get(id)) || '';
  }

  /**
   * up load blob and get a blob url
   * @param id
   * @returns {Promise<string | null>} blob url
   */
  async setBlob(workspace: WorkspaceUnit, blob: Blob): Promise<string> {
    const blobStorage = await workspace.blocksuiteWorkspace?.blobs;
    return (await blobStorage?.set(blob)) || '';
  }

  /**
   * get members of a workspace
   * @param workspaceId
   */
  async getMembers(workspaceId: string) {
    const workspaceInfo = this._workspaceUnitCollection.find(workspaceId);
    assert(workspaceInfo, 'Workspace not found');
    const provider = this.providerMap.get(workspaceInfo.provider);
    if (provider) {
      return await provider.getWorkspaceMembers(workspaceId);
    }
    return [];
  }

  /**
   * accept invitation
   * @param {string} inviteCode
   * @returns {Promise<Permission | null>} permission
   */
  async acceptInvitation(inviteCode: string, providerStr = 'affine') {
    const provider = this.providerMap.get(providerStr);
    if (provider) {
      return await provider.acceptInvitation(inviteCode);
    }
    return null;
  }

  onMessage(cb: (message: Message) => void) {
    return this._messageCenter.onMessage(cb);
  }
}
