import {
  StyledPublishContent,
  StyledPublishCopyContainer,
  StyledPublishExplanation,
} from './style';
import { DownloadIcon } from '@blocksuite/icons';
import { Button } from '@/ui/button';
import { Menu, MenuItem } from '@/ui/menu';
import { WorkspaceInfo } from '@affine/datacenter';
import { useWorkspaceHelper } from '@/hooks/use-workspace-helper';
import { useAppState } from '@/providers/app-state-provider';
import { useConfirm } from '@/providers/ConfirmProvider';
import { toast } from '@/ui/toast';
import { useRouter } from 'next/router';
export const SyncPage = ({ workspace }: { workspace: WorkspaceInfo }) => {
  // console.log('workspace: ', workspace);
  const { enableWorkspace } = useWorkspaceHelper();
  const { currentWorkspace, user } = useAppState();
  const { confirm } = useConfirm();
  const router = useRouter();
  return (
    <div>
      <StyledPublishContent>
        {workspace?.provider === 'local' ? (
          <>
            <StyledPublishExplanation>
              {workspace.name ?? 'Affine'} is Local Workspace. All data is
              stored on the current device. You can enable AFFiNE Cloud for this
              workspace to keep data in sync with the cloud.
            </StyledPublishExplanation>

            <StyledPublishCopyContainer>
              <Button
                onClick={() => {
                  confirm({
                    title: 'Enable AFFiNE Cloud?',
                    content: `If enabled, the data in this workspace will be backed up and synchronized via AFFiNE Cloud.`,
                    confirmText: user ? 'Enable' : 'Sign in and Enable',
                    cancelText: 'Skip',
                  }).then(async confirm => {
                    if (confirm && currentWorkspace) {
                      // if (user) {
                      //   await login();
                      // }
                      const id = await enableWorkspace(currentWorkspace);
                      router.push(`/workspace/${id}`);
                      toast('Enabled success');
                    }
                  });
                }}
                type="primary"
                shape="circle"
              >
                Enable AFFiNE Cloud
              </Button>
            </StyledPublishCopyContainer>
          </>
        ) : (
          <>
            <StyledPublishExplanation>
              <code>{workspace.name ?? 'Affine'}</code> is Cloud Workspace. All
              data will be synchronized and saved to the AFFiNE
            </StyledPublishExplanation>
            <StyledPublishCopyContainer>
              <Menu
                content={
                  <>
                    <MenuItem
                      onClick={() => {
                        // deleteMember(workspace.id, 0);
                      }}
                      icon={<DownloadIcon />}
                    >
                      Download core data to device
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        // deleteMember(workspace.id, 0);
                      }}
                      icon={<DownloadIcon />}
                    >
                      Download all data to device
                    </MenuItem>
                  </>
                }
                placement="bottom-end"
                disablePortal={true}
              >
                <Button>Download all data to device</Button>
              </Menu>
            </StyledPublishCopyContainer>
          </>
        )}
      </StyledPublishContent>
    </div>
  );
};
