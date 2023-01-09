import * as Y from 'yjs';
import assert from 'assert';

import { LocalProvider } from '../local/index.js';
import * as ipcMethods from './ipc/methods.js';
import { ProviderConstructorParams } from '../base.js';
import { BlockSchema } from '@blocksuite/blocks/models.js';
import { Workspace } from '@blocksuite/store';
import { ConfigStore } from 'src/store.js';
import { User, Workspace as WS, WorkspaceMeta, Logger } from '../../types';
import { getDefaultHeadImgBlob } from 'src/utils/index.js';
import { IPCBlobProvider } from './blocksuite-provider/blob.js';

export class TauriIPCProvider extends LocalProvider {
  static id = 'tauri-ipc';
  #ipc = ipcMethods;

  constructor(params: ProviderConstructorParams) {
    super(params);
    // TODO: let blocksuite's blob provider get blob receive workspace id. Currently, all blobs are placed together
    this._blobs.addProvider(new IPCBlobProvider());
  }

  async initData() {
    assert(this._workspace.room);
    this._logger('Loading local data');
    const {
      doc,
      room,
      meta: { id },
    } = this._workspace;
    this.#initDocFromIPC(id, doc);
    this.#connectDocToIPC(id, doc);
    this._logger('Local data loaded');
  }

  async #initDocFromIPC(workspaceID: string, doc: Y.Doc) {
    this._logger(`Loading ${workspaceID}...`);
    const updates = await this.#ipc.getYDocument({ id: Number(workspaceID) });
    if (updates) {
      await new Promise(resolve => {
        doc.once('update', resolve);
        Y.applyUpdate(doc, new Uint8Array(updates.update));
      });
      this._logger(`Loaded: ${workspaceID}`);

      // only add to list as online workspace
      this._signals.listAdd.emit({
        workspace: workspaceID,
        provider: this.id,
        locally: true,
      });
    }
  }

  async #connectDocToIPC(workspaceID: string, doc: Y.Doc) {
    this._logger(`Connecting yDoc for ${workspaceID}...`);
    doc.on(
      'update',
      async (
        update: Uint8Array,
        _origin: any,
        _yDocument: Y.Doc,
        _transaction: Y.Transaction
      ) => {
        try {
          // TODO: need handle potential data race when update is frequent?
          // TODO: update seems too frequent upon each keydown, why no batching?
          const success = await this.#ipc.updateYDocument({
            update: Array.from(update),
            id: Number(workspaceID),
          });
          if (!success) {
            throw new Error(
              `YDoc update failed, id: ${this.workspace.meta.id}`
            );
          }
        } catch (error) {
          // TODO: write error log to disk, and add button to open them in settings panel
          console.error("#yDocument.on('update'", error);
        }
      }
    );
  }

  static async auth(
    _config: Readonly<ConfigStore<string>>,
    _logger: Logger,
    _signals: DataCenterSignals
  ) {
    // no auth on local provider
  }

  async clear() {
    await super.clear();
  }

  public override async createWorkspace(
    meta: WorkspaceMeta
  ): Promise<Workspace | undefined> {
    assert(meta.name, 'Workspace name is required');
    if (!meta.avatar) {
      // set default avatar
      const blob = await getDefaultHeadImgBlob(meta.name);
      meta.avatar = (await this.setBlob(blob)) || '';
    }
    const { id } = await this.#ipc.createWorkspace({
      name: meta.name,
      // TODO: get userID here
      user_id: 0,
    });
    this._logger('Creating affine workspace');
    const nw = new Workspace({
      room: id,
    }).register(BlockSchema);
    nw.meta.setName(meta.name);
    nw.meta.setAvatar(meta.avatar);
    // this._initWorkspaceDb(nw);

    const workspaceInfo: WS = {
      name: meta.name,
      id,
      isPublish: false,
      avatar: '',
      owner: undefined,
      isLocal: true,
      memberCount: 1,
      provider: 'local',
    };

    this._workspaces.add(workspaceInfo);
    return nw;
  }

  override async loadWorkspaces() {
    // TODO: get user id here
    const workspacesList = await this.#ipc.getWorkspaces({ user_id: 0 });
    const workspaces: WS[] = workspacesList.workspaces.map(w => {
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
        new Workspace({
          room: id,
        }).register(BlockSchema);
      this._workspacesCache.set(id, workspace);
      if (workspace) {
        return new Promise<Workspace>(resolve => {
          downloadWorkspace(id).then(data => {
            applyUpdate(workspace.doc, new Uint8Array(data));
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
    const getDetailList = workspacesList.map(w => {
      const { id } = w;
      return new Promise<{ id: string; detail: WorkspaceDetail | null }>(
        resolve => {
          getWorkspaceDetail({ id }).then(data => {
            resolve({ id, detail: data || null });
          });
        }
      );
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

    workspaces.forEach(workspace => {
      this._workspaces.add(workspace);
    });

    return workspaces;
  }
}
