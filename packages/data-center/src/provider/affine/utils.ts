import assert from 'assert';
import { Workspace as BlocksuiteWorkspace } from '@blocksuite/store';
import { WorkspaceUnit } from '../../workspace-unit.js';
import type { WorkspaceUnitCtorParams } from '../../workspace-unit';
import { createBlocksuiteWorkspace } from '../../utils/index.js';
import type { Apis } from './apis';
import { WebsocketProvider } from './sync.js';
import { setDefaultAvatar } from '../utils.js';
import { applyUpdate } from '../../utils/index.js';

export const loadWorkspaceUnit = async (
  params: WorkspaceUnitCtorParams,
  apis: Apis
) => {
  const workspaceUnit = new WorkspaceUnit(params);
  const blocksuiteWorkspace = createBlocksuiteWorkspace(workspaceUnit.id);

  const updates = await apis.downloadWorkspace(
    workspaceUnit.id,
    params.published
  );
  applyUpdate(blocksuiteWorkspace, new Uint8Array(updates));

  const details = await apis.getWorkspaceDetail({ id: workspaceUnit.id });
  const owner = details?.owner;

  workspaceUnit.setBlocksuiteWorkspace(blocksuiteWorkspace);
  workspaceUnit.update({
    name: blocksuiteWorkspace.meta.name,
    avatar: blocksuiteWorkspace.meta.avatar,
    memberCount: details?.member_count || 1,
    owner: owner
      ? {
          id: owner.id,
          name: owner.name,
          avatar: owner.avatar_url,
          email: owner.email,
        }
      : undefined,
  });

  return workspaceUnit;
};

export const syncToCloud = async (
  blocksuiteWorkspace: BlocksuiteWorkspace,
  refreshToken: string
) => {
  const workspaceId = blocksuiteWorkspace.room;
  assert(workspaceId, 'Blocksuite workspace without room(workspaceId).');

  const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${
    window.location.host
  }/api/sync/`;

  const ws = new WebsocketProvider(
    wsUrl,
    workspaceId,
    blocksuiteWorkspace.doc,
    {
      params: { token: refreshToken },
    }
  );

  await new Promise((resolve, reject) => {
    ws.once('synced', () => {
      // FIXME: we don't when send local data to cloud successfully, so hack to wait 1s.
      // Server will support this by add a new api.
      setTimeout(resolve, 1000);
    });
    ws.once('lost-connection', () => reject());
    ws.once('connection-error', () => reject());
  });
};

export const createWorkspaceUnit = async (params: WorkspaceUnitCtorParams) => {
  const workspaceUnit = new WorkspaceUnit(params);

  const blocksuiteWorkspace = createBlocksuiteWorkspace(workspaceUnit.id);

  blocksuiteWorkspace.meta.setName(workspaceUnit.name);
  if (!workspaceUnit.avatar) {
    await setDefaultAvatar(blocksuiteWorkspace);
    workspaceUnit.update({ avatar: blocksuiteWorkspace.meta.avatar });
  }

  workspaceUnit.setBlocksuiteWorkspace(blocksuiteWorkspace);

  return workspaceUnit;
};
