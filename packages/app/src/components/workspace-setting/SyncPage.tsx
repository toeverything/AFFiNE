import {
  StyledPublishContent,
  StyledPublishCopyContainer,
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
export const SyncPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
  const { t } = useTranslation();
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
              />
              <StyledWorkspaceName>
                &nbsp;{workspace.name}&nbsp;
              </StyledWorkspaceName>
              <StyledWorkspaceType>is a Local Workspace.</StyledWorkspaceType>
            </StyledPublishExplanation>
            <StyledWorkspaceType>
              All data is stored on the current device. You can enable AFFiNE
              Cloud for this workspace to keep data in sync with the cloud.
            </StyledWorkspaceType>
            <StyledPublishCopyContainer>
              <EnableWorkspaceButton></EnableWorkspaceButton>
            </StyledPublishCopyContainer>
          </>
        ) : (
          <>
            <StyledPublishExplanation>
              <Trans i18nKey="Sync Description2">
                <code>{{ workspaceName: workspace.name ?? 'Affine' }}</code>
                is Cloud Workspace. All data will be synchronised and saved to
                the AFFiNE
              </Trans>
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
            </StyledPublishCopyContainer>
          </>
        )}
      </StyledPublishContent>
    </div>
  );
};
