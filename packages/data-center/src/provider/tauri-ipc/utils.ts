import { createBlocksuiteWorkspace } from '../../utils';
import type { WorkspaceUnitCtorParams } from '../../workspace-unit';
import { WorkspaceUnit } from '../../workspace-unit';
import { setDefaultAvatar } from '../utils';
import { IPCBlobProvider } from './blocksuite-provider/blob';

export const createWorkspaceUnit = async (params: WorkspaceUnitCtorParams) => {
  const workspaceUnit = new WorkspaceUnit(params);

  const blocksuiteWorkspace = createBlocksuiteWorkspace({
    id: workspaceUnit.id,
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
