import {
  StyledPublishContent,
  StyledPublishCopyContainer,
  StyledPublishExplanation,
} from './style';
import { DownloadIcon } from '@blocksuite/icons';
import { Button } from '@/ui/button';
import { Menu, MenuItem } from '@/ui/menu';
import { useTemporaryHelper } from '@/providers/temporary-helper-provider';
import { Workspace } from '@affine/datacenter';
import { Trans, useTranslation } from 'react-i18next';
export const SyncPage = ({ workspace }: { workspace: Workspace }) => {
  console.log('workspace: ', workspace);
  const { currentWorkspace, updateWorkspaceMeta } = useTemporaryHelper();
  const { t } = useTranslation();

  return (
    <div>
      <StyledPublishContent>
        {currentWorkspace?.type === 'local' ? (
          <>
            <StyledPublishExplanation>
              {t('Sync Description', { workspaceName: currentWorkspace.name })}
            </StyledPublishExplanation>

            <StyledPublishCopyContainer>
              <Button
                onClick={() => {
                  updateWorkspaceMeta(currentWorkspace.id, {
                    type: 'cloud',
                  });
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
                <code>
                  {{ workspaceName: currentWorkspace && currentWorkspace.name }}
                </code>
                is Cloud Workspace. All data will be synchronized and saved to
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
                <Button>
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
