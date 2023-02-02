import {
  StyledButtonContainer,
  StyledPublishContent,
  StyledPublishExplanation,
  StyledWorkspaceName,
  StyledEmail,
} from './style';
// import { DownloadIcon } from '@blocksuite/icons';
// import { Button } from '@/ui/button';
// import { Menu, MenuItem } from '@/ui/menu';
import { WorkspaceUnit } from '@affine/datacenter';
import { useTranslation, Trans } from '@affine/i18n';
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
              <StyledWorkspaceName>{workspace.name}&nbsp;</StyledWorkspaceName>
              <span>{t('is a Local Workspace')}</span>
            </StyledPublishExplanation>
            <div>{t('Local Workspace Description')}</div>
            <StyledButtonContainer>
              <EnableWorkspaceButton></EnableWorkspaceButton>
            </StyledButtonContainer>
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
              <StyledWorkspaceName>{workspace.name}&nbsp;</StyledWorkspaceName>
              <span>{t('is a Cloud Workspace')}</span>
            </StyledPublishExplanation>
            <div>
              <Trans i18nKey="Cloud Workspace Description">
                All data will be synchronised and saved to the AFFiNE account
                <StyledEmail>
                  {{
                    email: '{' + user?.email + '}.',
                  }}
                </StyledEmail>
              </Trans>
            </div>
            {/* TODO: will finish the feature next version  */}
            {/* <StyledButtonContainer>
              <Menu
                content={
                  <>
                    <MenuItem
                      onClick={() => {
                        // deleteMember(workspace.id, 0);
                      }}
                      icon={<DownloadIcon />}
                    >
                      {t('Download data', { CoreOrAll: t('core') })}
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        // deleteMember(workspace.id, 0);
                      }}
                      icon={<DownloadIcon />}
                    >
                      {t('Download data', { CoreOrAll: t('all') })}
                    </MenuItem>
                  </>
                }
                placement="bottom-end"
                disablePortal={true}
              >
                <Button type="primary">
                  {t('Download data', { CoreOrAll: '' })}
                </Button>
              </Menu>
            </StyledButtonContainer> */}
          </>
        )}
      </StyledPublishContent>
    </div>
  );
};
