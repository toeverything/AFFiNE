import type {
  BlobOptionsGetter,
  Workspace as BlocksuiteWorkspace,
} from '@blocksuite/store';

import type { User } from './types';

export type SyncMode = 'all' | 'core';

export interface WorkspaceUnitCtorParams {
  id: string;
  name: string;
  avatar?: string;
  owner?: User;
  published?: boolean;
  memberCount: number;
  provider: string;
  syncMode: SyncMode;

  blobOptionsGetter?: BlobOptionsGetter;
  blocksuiteWorkspace?: BlocksuiteWorkspace | null;
}

export type UpdateWorkspaceUnitParams = Partial<
  Omit<WorkspaceUnitCtorParams, 'id'>
>;

export class WorkspaceUnit {
  public readonly id: string;
  public name!: string;
  public avatar?: string;
  public owner?: User;
  public published?: boolean;
  public memberCount!: number;
  public provider!: string;
  public syncMode: 'all' | 'core' = 'core';

  private _blocksuiteWorkspace?: BlocksuiteWorkspace | null;

  constructor(params: WorkspaceUnitCtorParams) {
    this.id = params.id;
    this.update(params);
  }

  get isPublish() {
    console.error('Suggest changing to published');
    return this.published;
  }

  get isLocal() {
    console.error('Suggest changing to syncMode');
    return this.syncMode === 'all';
  }

  get blocksuiteWorkspace() {
    return this._blocksuiteWorkspace;
  }

  setBlocksuiteWorkspace(blocksuiteWorkspace: BlocksuiteWorkspace | null) {
    if (blocksuiteWorkspace && blocksuiteWorkspace.id !== this.id) {
      throw new Error('Workspace id inconsistent.');
    }
    this._blocksuiteWorkspace = blocksuiteWorkspace;
  }

  update(params: UpdateWorkspaceUnitParams) {
    Object.assign(this, params);
    if (params.blocksuiteWorkspace) {
      this.setBlocksuiteWorkspace(params.blocksuiteWorkspace);
    }
    if (params.blobOptionsGetter && this.blocksuiteWorkspace) {
      this.blocksuiteWorkspace.setGettingBlobOptions(params.blobOptionsGetter);
    }
  }

  toJSON(): Omit<
    WorkspaceUnitCtorParams,
    'blocksuiteWorkspace' | 'blobOptionsGetter'
  > {
    return {
      id: this.id,
      name: this.name,
      avatar: this.avatar,
      owner: this.owner,
      published: this.published,
      memberCount: this.memberCount,
      provider: this.provider,
      syncMode: this.syncMode,
    };
  }

  /**
   * @internal only for debug use
   */
  exportWorkspaceYDoc(): void {
    this._blocksuiteWorkspace?.exportYDoc();
  }
}
