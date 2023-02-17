import { WorkspaceUnit } from '@affine/datacenter';
import { useCallback } from 'react';

import { useGlobalState } from '@/store/app';

export const useWorkspaceHelper = () => {
  const dataCenter = useGlobalState(store => store.dataCenter);
  const currentWorkspace = useGlobalState(
    useCallback(store => store.currentDataCenterWorkspace, [])
  );
  const loadWorkspace = useGlobalState(store => store.loadWorkspace);
  const createWorkspace = async (name: string) => {
    const workspaceInfo = await dataCenter.createWorkspace({
      name: name,
    });
    if (workspaceInfo && workspaceInfo.id) {
      return loadWorkspace(workspaceInfo.id);
    }
    return null;
  };

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
    let inviteInfo;
    if (inviteCode) {
      inviteInfo = await dataCenter.acceptInvitation(inviteCode);
    }
    return inviteInfo;
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
