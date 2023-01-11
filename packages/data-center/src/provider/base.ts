import { Workspace as BlocksuiteWorkspace } from '@blocksuite/store';
import { MessageCenter } from '../message';
import { Logger, User } from '../types';
import type { WorkspaceUnitCollectionScope } from '../workspace-unit-collection';
import type { WorkspaceUnitCtorParams, WorkspaceUnit } from '../workspace-unit';
import { Member } from './affine/apis';

const defaultLogger = () => {
  return;
};

export interface ProviderConstructorParams {
  logger?: Logger;
  workspaces: WorkspaceUnitCollectionScope;
  messageCenter: MessageCenter;
}

export type WorkspaceMeta0 = WorkspaceUnitCtorParams;
export type CreateWorkspaceInfoParams = Pick<WorkspaceUnitCtorParams, 'name'>;
export type UpdateWorkspaceMetaParams = Partial<
  Pick<WorkspaceUnitCtorParams, 'name' | 'avatar'>
>;

export class BaseProvider {
  public readonly id: string = 'base';
  protected _workspaces!: WorkspaceUnitCollectionScope;
  protected _logger!: Logger;
  protected _messageCenter!: MessageCenter;

  public constructor({
    logger,
    workspaces,
    messageCenter,
  }: ProviderConstructorParams) {
    this._logger = (logger || defaultLogger) as Logger;
    this._workspaces = workspaces;
    this._messageCenter = messageCenter;
  }

  /**
   * hook after provider registered
   */
  public async init() {
    return;
  }

  /**
   * auth provider
   */
  public async auth() {
    return;
  }

  /**
   * logout provider
   */
  public async logout() {
    return;
  }

  /**
   * warp workspace with provider functions
   * @param workspace
   * @returns
   */
  public async warpWorkspace(
    workspace: BlocksuiteWorkspace
  ): Promise<BlocksuiteWorkspace> {
    return workspace;
  }

  /**
   * @deprecated Temporary for public workspace
   * @param blocksuiteWorkspace
   * @returns
   */
  public async loadPublicWorkspace(blocksuiteWorkspace: BlocksuiteWorkspace) {
    return blocksuiteWorkspace;
  }

  /**
   * load workspaces
   **/
  public async loadWorkspaces(): Promise<WorkspaceUnit[]> {
    throw new Error(`provider: ${this.id} loadWorkSpace Not implemented`);
  }

  /**
   * get auth user info
   * @returns
   */
  public async getUserInfo(): Promise<User | undefined> {
    return;
  }

  // async getBlob(id: string): Promise<string | null> {
  //   return await this._blobs.get(id);
  // }

  // async setBlob(blob: Blob): Promise<string> {
  //   return await this._blobs.set(blob);
  // }

  /**
   * clear all local data in provider
   */
  async clear() {
    // this._blobs.clear();
  }

  /**
   * delete workspace include all data
   * @param id workspace id
   */
  public async deleteWorkspace(id: string): Promise<void> {
    id;
    return;
  }

  /**
   * leave workspace by workspace id
   * @param id workspace id
   */
  public async leaveWorkspace(id: string): Promise<void> {
    id;
    return;
  }

  /**
   * close db link and websocket connection and other resources
   * @param id workspace id
   */
  public async closeWorkspace(id: string) {
    id;
    return;
  }

  /**
   * invite workspace member
   * @param id workspace id
   */
  public async invite(id: string, email: string): Promise<void> {
    id;
    email;
    return;
  }

  /**
   * remove workspace member by permission id
   * @param permissionId
   */
  public async removeMember(permissionId: number): Promise<void> {
    permissionId;
    return;
  }

  public async publish(id: string, isPublish: boolean): Promise<void> {
    id;
    isPublish;
    return;
  }

  /**
   * change workspace meta by workspace id , work for cached list in different provider
   * @param id
   * @param meta
   * @returns
   */
  public async updateWorkspaceMeta(
    id: string,
    params: UpdateWorkspaceMetaParams
  ): Promise<void> {
    id;
    params;
    return;
  }

  /**
   * create workspace by workspace meta
   * @param {CreateWorkspaceInfoParams} meta
   */
  public async createWorkspace(
    meta: CreateWorkspaceInfoParams
  ): Promise<WorkspaceUnit | undefined> {
    throw new Error(`provider: ${this.id} createWorkspace not implemented`);
  }

  public async extendWorkspace(
    workspaceUnit: WorkspaceUnit
  ): Promise<WorkspaceUnit | undefined> {
    throw new Error(`provider: ${this.id} extendWorkspace not implemented`);
  }

  /**
   * get user by email
   * @param {string} id
   * @param {string} email
   * @returns
   */
  public async getUserByEmail(id: string, email: string): Promise<User | null> {
    email;
    return null;
  }

  /**
   * link workspace to local caches
   * @param workspace
   * @returns
   */
  public async linkLocal(
    workspace: BlocksuiteWorkspace
  ): Promise<BlocksuiteWorkspace> {
    return workspace;
  }

  /**
   * get workspace members
   * @param {string} workspaceId
   * @returns
   */
  public getWorkspaceMembers(workspaceId: string): Promise<Member[]> {
    workspaceId;
    return Promise.resolve([]);
  }
}
