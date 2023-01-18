import { useAppState } from '@/providers/app-state-provider';
import { useConfirm } from '@/providers/ConfirmProvider';
import { toast } from '@/ui/toast';
import { WorkspaceUnit } from '@affine/datacenter';
import router from 'next/router';

export const useWorkspaceHelper = () => {
  const { confirm } = useConfirm();
  const { dataCenter, currentWorkspace, user, login } = useAppState();
  const createWorkspace = async (name: string) => {
    const workspaceInfo = await dataCenter.createWorkspace({
      name: name,
    });
    if (workspaceInfo && workspaceInfo.id) {
      return await dataCenter.loadWorkspace(workspaceInfo.id);
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
      // const blobId = await dataCenter.setBlob(workspace, avatarBlob);
      // await dataCenter.updateWorkspaceMeta({ avatar: blobId }, workspace);
    }
  };

  const enableWorkspace = async () => {
    confirm({
      title: 'Enable AFFiNE Cloud?',
      content: `If enabled, the data in this workspace will be backed up and synchronized via AFFiNE Cloud.`,
      confirmText: user ? 'Enable' : 'Sign in and Enable',
      cancelText: 'Skip',
      confirmType: 'primary',
      buttonDirection: 'column',
    }).then(async confirm => {
      if (confirm && currentWorkspace) {
        if (!user) {
          await login();
        }
        const workspace = await dataCenter.enableWorkspaceCloud(
          currentWorkspace
        );
        workspace && router.push(`/workspace/${workspace.id}/setting`);
        toast('Enabled success');
      }
    });
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
    enableWorkspace,
    deleteWorkSpace,
    leaveWorkSpace,
    acceptInvite,
  };
};
