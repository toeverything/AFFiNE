import { WorkspaceUnit } from '../../workspace-unit.js';
import type { WorkspaceUnitCtorParams } from '../../workspace-unit';
import { createBlocksuiteWorkspace } from '../../utils/index.js';
import type { Apis } from './apis';
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
