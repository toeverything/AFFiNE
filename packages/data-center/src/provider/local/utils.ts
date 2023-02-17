import { WorkspaceUnit } from '../../workspace-unit';
import type { WorkspaceUnitCtorParams } from '../../workspace-unit';
import { createBlocksuiteWorkspace } from '../../utils';
import { applyLocalUpdates, writeUpdatesToLocal } from './indexeddb/utils';
import { setDefaultAvatar } from '../utils';

export const loadWorkspaceUnit = async (params: WorkspaceUnitCtorParams) => {
  const workspaceUnit = new WorkspaceUnit(params);

  const blocksuiteWorkspace = createBlocksuiteWorkspace(workspaceUnit.id, {
    blobOptionsGetter: (k: string) => undefined,
  });

  await applyLocalUpdates(blocksuiteWorkspace);

  workspaceUnit.setBlocksuiteWorkspace(blocksuiteWorkspace);

  return workspaceUnit;
};

export const createWorkspaceUnit = async (params: WorkspaceUnitCtorParams) => {
  const workspaceUnit = new WorkspaceUnit(params);

  const blocksuiteWorkspace = createBlocksuiteWorkspace(workspaceUnit.id, {
    blobOptionsGetter: (k: string) => undefined,
  });
  blocksuiteWorkspace.meta.setName(workspaceUnit.name);
  if (!workspaceUnit.avatar) {
    await setDefaultAvatar(blocksuiteWorkspace);
    workspaceUnit.update({ avatar: blocksuiteWorkspace.meta.avatar });
  }
  if (typeof window !== 'undefined') {
    await writeUpdatesToLocal(blocksuiteWorkspace);
  }

  workspaceUnit.setBlocksuiteWorkspace(blocksuiteWorkspace);

  return workspaceUnit;
};
