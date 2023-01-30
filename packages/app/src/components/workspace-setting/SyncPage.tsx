import {
  StyleAsync,
  StyledPublishContent,
  StyledPublishExplanation,
  StyledWorkspaceName,
  StyledWorkspaceType,
} from './style';
import { DownloadIcon } from '@blocksuite/icons';
import { Button } from '@/ui/button';
import { Menu, MenuItem } from '@/ui/menu';
import { WorkspaceUnit } from '@affine/datacenter';
import { Trans, useTranslation } from '@affine/i18n';
import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
import { EnableWorkspaceButton } from '../enable-workspace';
import { useAppState } from '@/providers/app-state-provider';
export const SyncPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
  const { t } = useTranslation();
  const { user } = useAppState();
  return (
    <div>
      <StyledPublishContent>
        {workspace.provider === 'local' ? (
          <>
            <StyledPublishExplanation>
              <WorkspaceUnitAvatar
                size={32}
                name={workspace.name}
                workspaceUnit={workspace}
                style={{ marginRight: '12px' }}
              />
              <StyledWorkspaceName>{workspace.name};</StyledWorkspaceName>
              <StyledWorkspaceType>is a Local Workspace.</StyledWorkspaceType>
            </StyledPublishExplanation>
            <StyledWorkspaceType>
              All data is stored on the current device. You can enable AFFiNE
              Cloud for this workspace to keep data in sync with the cloud.
            </StyledWorkspaceType>
            <StyleAsync>
              <EnableWorkspaceButton></EnableWorkspaceButton>
            </StyleAsync>
          </>
        ) : (
          <>
            <StyledPublishExplanation>
              <WorkspaceUnitAvatar
                size={32}
                name={workspace.name}
                workspaceUnit={workspace}
                style={{ marginRight: '12px' }}
              />
              <StyledWorkspaceName>{workspace.name} </StyledWorkspaceName>is
              Cloud Workspace.
            </StyledPublishExplanation>
            <StyledWorkspaceType>
              All data will be synchronized and saved to the AFFiNE account{' '}
              {user?.email}
            </StyledWorkspaceType>
            <StyleAsync>
              <Menu
                content={
                  <>
                    <MenuItem
                      onClick={() => {
                        // deleteMember(workspace.id, 0);
                      }}
                      icon={<DownloadIcon />}
                    >
                      {t('Download data to device', { CoreOrAll: 'core' })}
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        // deleteMember(workspace.id, 0);
                      }}
                      icon={<DownloadIcon />}
                    >
                      {t('Download data to device', { CoreOrAll: 'all' })}
                    </MenuItem>
                  </>
                }
                placement="bottom-end"
                disablePortal={true}
              >
                <Button type="primary">
                  {t('Download data to device', { CoreOrAll: 'all' })}
                </Button>
              </Menu>
            </StyleAsync>
          </>
        )}
      </StyledPublishContent>
    </div>
  );
};
