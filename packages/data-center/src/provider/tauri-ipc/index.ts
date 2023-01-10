import * as Y from 'yjs';
import assert from 'assert';

import { LocalProvider } from '../local/index.js';
import * as ipcMethods from './ipc/methods.js';
import { ProviderConstructorParams } from '../base.js';
import { BlockSchema } from '@blocksuite/blocks/models.js';
import { Workspace as BlocksuiteWorkspace } from '@blocksuite/store';
import { WorkspaceMeta, WorkspaceInfo } from '../../types';
import { IPCBlobProvider } from './blocksuite-provider/blob.js';
import { WorkspaceDetail } from '../affine/apis/workspace.js';
import { setDefaultAvatar } from '../utils.js';

export class TauriIPCProvider extends LocalProvider {
  static id = 'tauri-ipc';
  #ipc = ipcMethods;
  private _workspacesCache: Map<string, BlocksuiteWorkspace> = new Map();

  constructor(params: ProviderConstructorParams) {
    super(params);
    // TODO: let blocksuite's blob provider get blob receive workspace id. Currently, all blobs are placed together
  }

  async init() {
    // nothing to init until load workspace
  }

  async #initDocFromIPC(workspaceID: string, doc: Y.Doc) {
    this._logger(`Loading ${workspaceID}...`);
    const updates = await this.#ipc.getYDocument({ id: workspaceID });
    if (updates) {
      await new Promise(resolve => {
        doc.once('update', resolve);
        Y.applyUpdate(doc, new Uint8Array(updates.update));
      });
      this._logger(`Loaded: ${workspaceID}`);
    }
  }

  async #connectDocToIPC(workspaceID: string, doc: Y.Doc) {
    this._logger(`Connecting yDoc for ${workspaceID}...`);
    doc.on('update', async (update: Uint8Array) => {
      try {
        // TODO: need handle potential data race when update is frequent?
        // TODO: update seems too frequent upon each keydown, why no batching?
        const success = await this.#ipc.updateYDocument({
          update: Array.from(update),
          id: workspaceID,
        });
        if (!success) {
          throw new Error(`YDoc update failed, id: ${workspaceID}`);
        }
      } catch (error) {
        // TODO: write error log to disk, and add button to open them in settings panel
        console.error("#yDocument.on('update'", error);
      }
    });
  }

  async clear() {
    await super.clear();
  }

  public override async createWorkspaceInfo(
    meta: WorkspaceMeta
  ): Promise<WorkspaceInfo> {
    const { id } = await this.#ipc.createWorkspace({
      name: meta.name,
      // TODO: get userID here
      user_id: 0,
    });

    const workspaceInfo: WorkspaceInfo = {
      name: meta.name,
      id: id,
      isPublish: false,
      avatar: '',
      owner: await this.getUserInfo(),
      isLocal: true,
      memberCount: 1,
      provider: this.id,
    };
    return workspaceInfo;
  }

  override async warpWorkspace(blocksuiteWorkspace: BlocksuiteWorkspace) {
    const { doc, room } = blocksuiteWorkspace;
    assert(room);

    (await blocksuiteWorkspace.blobs)?.addProvider(new IPCBlobProvider());
    await this.#initDocFromIPC(room, doc);
    await this.#connectDocToIPC(room, doc);

    return blocksuiteWorkspace;
  }

  public override async createWorkspace(
    blocksuiteWorkspace: BlocksuiteWorkspace,
    meta: WorkspaceMeta
  ): Promise<BlocksuiteWorkspace | undefined> {
    const workspaceId = blocksuiteWorkspace.room;
    assert(workspaceId, 'Blocksuite Workspace without room(workspaceId).');
    this._logger('Creating affine workspace');

    this.linkLocal(blocksuiteWorkspace);

    const workspaceInfo: WorkspaceInfo = {
      name: meta.name,
      id: workspaceId,
      isPublish: false,
      avatar: '',
      owner: undefined,
      isLocal: true,
      memberCount: 1,
      provider: 'affine',
    };

    if (!blocksuiteWorkspace.meta.avatar) {
      await setDefaultAvatar(blocksuiteWorkspace);
      workspaceInfo.avatar = blocksuiteWorkspace.meta.avatar;
    }
    this._workspaces.add(workspaceInfo);
    return blocksuiteWorkspace;
  }

  override async loadWorkspaces() {
    // TODO: get user id here
    const { workspaces: workspacesList } = await this.#ipc.getWorkspaces({
      user_id: 0,
    });
    const workspaces: WorkspaceInfo[] = workspacesList.map(w => {
      return {
        ...w,
        memberCount: 0,
        name: '',
        provider: 'affine',
      };
    });
    const workspaceInstances = workspaces.map(({ id }) => {
      const workspace =
        this._workspacesCache.get(id) ||
        new BlocksuiteWorkspace({
          room: id,
        }).register(BlockSchema);
      this._workspacesCache.set(id, workspace);
      if (workspace) {
        return new Promise<BlocksuiteWorkspace>(resolve => {
          this.#ipc.getYDocument({ id }).then(({ update }) => {
            Y.applyUpdate(workspace.doc, new Uint8Array(update));
            resolve(workspace);
          });
        });
      } else {
        return Promise.resolve(null);
      }
    });

    (await Promise.all(workspaceInstances)).forEach((workspace, i) => {
      if (workspace) {
        workspaces[i] = {
          ...workspaces[i],
          name: workspace.doc.meta.name,
          avatar: workspace.doc.meta.avatar,
        };
      }
    });
    const getDetailList = workspacesList.map(
      async (
        workspaceWithPermission
      ): Promise<{
        id: string;
        detail:
          | (Omit<WorkspaceDetail, 'owner'> & {
              owner?: Partial<WorkspaceDetail['owner']>;
            })
          | null;
      }> => {
        const { id, permission, created_at } = workspaceWithPermission;
        const { workspace } = await this.#ipc.getWorkspace({ id });
        return {
          id,
          detail: {
            ...workspace,
            owner: workspace.owner
              ? {
                  ...workspace.owner,
                  create_at: String(created_at),
                  avatar_url: workspace.owner.avatar_url ?? undefined,
                  id: String(workspace.owner.id),
                }
              : undefined,
            permission_type: permission,
            create_at: created_at,
          },
        };
      }
    );
    const ownerList = await Promise.all(getDetailList);
    (await Promise.all(ownerList)).forEach(detail => {
      if (detail) {
        const { id, detail: workspaceDetail } = detail;
        if (workspaceDetail) {
          const { owner, member_count } = workspaceDetail;
          const currentWorkspace = workspaces.find(w => w.id === id);
          if (currentWorkspace && owner) {
            currentWorkspace.owner = {
              id: owner.id!,
              name: owner.name!,
              avatar: owner.avatar_url!,
              email: owner.email!,
            };
            currentWorkspace.memberCount = member_count;
          }
        }
      }
    });

    workspaces.forEach(workspace => {
      this._workspaces.add(workspace);
    });

    return workspaces;
  }
}
