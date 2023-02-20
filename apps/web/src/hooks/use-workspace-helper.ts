import { WorkspaceUnit } from '@affine/datacenter';
import { useCallback } from 'react';

import { mutateDataCenter, useDataCenter, useGlobalState } from '@/store/app';

export const useWorkspaceHelper = () => {
  const dataCenter = useDataCenter();
  const currentWorkspace = useGlobalState(
    useCallback(store => store.currentDataCenterWorkspace, [])
  );

  const createWorkspace = useCallback(async (name: string) => {
    return mutateDataCenter(name);
  }, []);

  // const updateWorkspace = async (workspace: Workspace) => {};

  const publishWorkspace = async (workspaceId: string, publish: boolean) => {
    await dataCenter.setWorkspacePublish(workspaceId, publish);
  };

  const updateWorkspace = async (
    { name, avatarBlob }: { name?: string; avatarBlob?: Blob },
    workspace: WorkspaceUnit
  ) => {
    if (name) {
      await dataCenter.updateWorkspaceMeta({ name }, workspace);
    }
    if (avatarBlob) {
      const blobId = await dataCenter.setBlob(workspace, avatarBlob);
      await dataCenter.updateWorkspaceMeta({ avatar: blobId }, workspace);
    }
  };

  const deleteWorkSpace = async () => {
    currentWorkspace && (await dataCenter.deleteWorkspace(currentWorkspace.id));
  };
  const leaveWorkSpace = async () => {
    currentWorkspace && (await dataCenter.leaveWorkspace(currentWorkspace.id));
  };

  const acceptInvite = async (inviteCode: string) => {
    return dataCenter.acceptInvitation(inviteCode);
  };

  return {
    createWorkspace,
    publishWorkspace,
    updateWorkspace,
    deleteWorkSpace,
    leaveWorkSpace,
    acceptInvite,
  };
};
