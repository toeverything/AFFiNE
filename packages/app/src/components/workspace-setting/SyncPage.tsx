import {
  StyledPublishContent,
  StyledPublishCopyContainer,
  StyledPublishExplanation,
} from './style';
import { DownloadIcon } from '@blocksuite/icons';
import { Button } from '@/ui/button';
import { Menu, MenuItem } from '@/ui/menu';
import { WorkspaceUnit } from '@affine/datacenter';
import { useWorkspaceHelper } from '@/hooks/use-workspace-helper';
import { Trans, useTranslation } from '@affine/i18n';
export const SyncPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
  const { enableWorkspace } = useWorkspaceHelper();
  const { t } = useTranslation();
  return (
    <div>
      <StyledPublishContent>
        {workspace.provider === 'local' ? (
          <>
            <StyledPublishExplanation>
              {t('Sync Description', {
                workspaceName: workspace.name ?? 'Affine',
              })}
            </StyledPublishExplanation>

            <StyledPublishCopyContainer>
              <Button
                onClick={async () => {
                  await enableWorkspace();
                }}
                type="primary"
                shape="circle"
              >
                {t('Enable AFFiNE Cloud')}
              </Button>
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
