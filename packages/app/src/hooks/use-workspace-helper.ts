import { useAppState } from '@/providers/app-state-provider';
import { Workspace } from '@blocksuite/store';
export const useWorkspaceHelper = () => {
  const { dataCenter } = useAppState();
  const createWorkspace = async (name: string) => {
    const workspaceInfo = await dataCenter.createWorkspace({
      name: name,
    });
    if (workspaceInfo && workspaceInfo.room) {
      const workspace = await dataCenter.loadWorkspace(workspaceInfo.room);
      return workspace;
    }
    return null;
  };

  // const updateWorkspace = async (workspace: Workspace) => {};

  const publishWorkspace = async (workspaceId: string, publish: boolean) => {
    dataCenter.setWorkspacePublish(workspaceId, publish);
  };

  const updateWorkspace = async (
    { name, avatarBlob }: { name?: string; avatarBlob?: Blob },
    workspace: Workspace
  ) => {
    if (name) {
      await dataCenter.updateWorkspaceMeta({ name }, workspace);
    }
    if (avatarBlob) {
      const blobId = await dataCenter.setBlob(workspace, avatarBlob);
      await dataCenter.updateWorkspaceMeta({ avatar: blobId }, workspace);
    }
  };

  const enableWorkspace = async (workspace: Workspace) => {
    const newWorkspaceId = await dataCenter.enableWorkspaceCloud(workspace);
    // console.log('newWorkspace: ', newWorkspace);
    return newWorkspaceId;
  };
  return {
    createWorkspace,
    publishWorkspace,
    updateWorkspace,
    enableWorkspace,
  };
};
