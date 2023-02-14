import { WorkspaceUnit } from '../../workspace-unit.js';
import type { WorkspaceUnitCtorParams } from '../../workspace-unit';
import { createBlocksuiteWorkspace } from '../../utils/index.js';
import { setDefaultAvatar } from '../utils.js';
import { IPCBlobProvider } from './blocksuite-provider/blob.js';

export const createWorkspaceUnit = async (params: WorkspaceUnitCtorParams) => {
  const workspaceUnit = new WorkspaceUnit(params);

  const blocksuiteWorkspace = createBlocksuiteWorkspace(workspaceUnit.id, {
    blobOptionsGetter: (k: string) => undefined,
  });
  blocksuiteWorkspace.meta.setName(workspaceUnit.name);
  (await blocksuiteWorkspace.blobs)?.setProvider(
    await IPCBlobProvider.init(workspaceUnit.id)
  );
  if (!workspaceUnit.avatar) {
    await setDefaultAvatar(blocksuiteWorkspace);
    workspaceUnit.update({ avatar: blocksuiteWorkspace.meta.avatar });
  }

  workspaceUnit.setBlocksuiteWorkspace(blocksuiteWorkspace);

  return workspaceUnit;
};
