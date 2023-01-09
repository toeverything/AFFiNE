import { useAppState } from '@/providers/app-state-provider';

export const useWorkspaceHelper = () => {
  const { dataCenter } = useAppState();
  const createWorkspace = async (name: string) => {
    const workspaceInfo = await dataCenter.createWorkspace({
      name: name,
      avatar: 'cccc',
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

  return {
    createWorkspace,
    publishWorkspace,
  };
};
