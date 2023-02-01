import { WorkspaceUnit } from '../../workspace-unit.js';
import type { WorkspaceUnitCtorParams } from '../../workspace-unit';
import { createBlocksuiteWorkspace } from '../../utils/index.js';
import type { Apis } from './apis';
import { setDefaultAvatar } from '../utils.js';
import { applyUpdate } from '../../utils/index.js';
import { getDatabase } from './idb-kv.js';

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

interface PendingTask {
  id: string;
  blob: ArrayBufferLike;
}

export const migrateBlobDB = async (
  oldWorkspaceId: string,
  newWorkspaceId: string
) => {
  const oldDB = getDatabase('blob', oldWorkspaceId);
  const oldPendingDB = getDatabase<PendingTask>('pending', newWorkspaceId);

  const newDB = getDatabase('blob', newWorkspaceId);
  const newPendingDB = getDatabase<PendingTask>('pending', newWorkspaceId);

  const keys = await oldDB.keys();
  const values = await oldDB.getMany(keys);
  const entries = keys.map((key, index) => {
    return [key, values[index]] as [string, ArrayBufferLike];
  });
  await newDB.setMany(entries);

  const pendingEntries = entries.map(([id, blob]) => {
    return [id, { id, blob }] as [string, PendingTask];
  });
  await newPendingDB.setMany(pendingEntries);

  await oldDB.deleteDB();
  await oldPendingDB.deleteDB();
};
