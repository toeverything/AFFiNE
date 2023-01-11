import { useAppState } from '@/providers/app-state-provider';
import { useConfirm } from '@/providers/ConfirmProvider';
import { toast } from '@/ui/toast';
import { Workspace } from '@blocksuite/store';
import router from 'next/router';

export const useWorkspaceHelper = () => {
  const { confirm } = useConfirm();
  const { dataCenter, currentWorkspace, user, login, currentMetaWorkSpace } =
    useAppState();
  const createWorkspace = async (name: string) => {
    const workspaceInfo = await dataCenter.createWorkspace({
      name: name,
    });
    if (workspaceInfo && workspaceInfo.room) {
      return await dataCenter.loadWorkspace(workspaceInfo.room);
    }
    return null;
  };

  // const updateWorkspace = async (workspace: Workspace) => {};

  const publishWorkspace = async (workspaceId: string, publish: boolean) => {
    await dataCenter.setWorkspacePublish(workspaceId, publish);
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

  const enableWorkspace = async () => {
    confirm({
      title: 'Enable AFFiNE Cloud?',
      content: `If enabled, the data in this workspace will be backed up and synchronized via AFFiNE Cloud.`,
      confirmText: user ? 'Enable' : 'Sign in and Enable',
      cancelText: 'Skip',
    }).then(async confirm => {
      if (confirm && currentWorkspace) {
        if (user) {
          await login();
        }
        const newWorkspaceId = await dataCenter.enableWorkspaceCloud(
          currentWorkspace
        );
        router.push(`/workspace/${newWorkspaceId}/setting`);
        toast('Enabled success');
      }
    });
  };

  const inviteMember = async (email: string) => {
    currentMetaWorkSpace &&
      (await dataCenter.inviteMember(currentMetaWorkSpace?.id, email));
  };

  return {
    createWorkspace,
    publishWorkspace,
    updateWorkspace,
    enableWorkspace,
  };
};
