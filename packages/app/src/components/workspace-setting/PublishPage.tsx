import {
  StyledCopyButtonContainer,
  StyledPublishContent,
  StyledPublishCopyContainer,
  StyledPublishExplanation,
  StyledSettingH2,
} from './style';

import { Button } from '@/ui/button';
import Input from '@/ui/input';
import { toast } from '@/ui/toast';
import { useConfirm } from '@/providers/ConfirmProvider';
// import { useAppState } from '@/providers/app-state-provider3';
import { useWorkspaceHelper } from '@/hooks/use-workspace-helper';
import { Workspace } from '@affine/datacenter';
import { useTranslation } from 'react-i18next';

export const PublishPage = ({ workspace }: { workspace: Workspace }) => {
  const shareUrl =
    window.location.host + '/workspace/' + workspace.id + '?share=true';
  const { publishWorkspace } = useWorkspaceHelper();
  const { t } = useTranslation();
  const { confirm } = useConfirm();

  const togglePublic = (flag: boolean) => {
    workspace.id && publishWorkspace(workspace?.id, flag);
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(shareUrl);
    toast('Copied url to clipboard');
  };

  const enableAffineCloud = () => {
    confirm({
      title: `${t('Enable AFFiNE Cloud')}?`,
      content: t('Enable AFFiNE Cloud Description'),
      confirmText:
        workspace.provider === 'local' ? t('Enable') : t('Sign in and Enable'),
      cancelText: t('Skip'),
    }).then(confirm => {
      if (confirm) {
        // if (user) {
        //   updateWorkspaceMeta(workspace.id, { type: 'cloud' });
        // } else {
        //   login();
        //   updateWorkspaceMeta(workspace.id, { type: 'cloud' });
        // }
      }
    });
  };
  return (
    <>
      {workspace.provider === 'cloud' ? (
        <div>
          <StyledPublishContent>
            {workspace?.isPublish ? (
              <>
                <StyledPublishExplanation>
                  {t('Publishing')}
                </StyledPublishExplanation>
                <StyledSettingH2>{t('Share with link')}</StyledSettingH2>
                <StyledPublishCopyContainer>
                  <Input width={500} value={shareUrl} disabled={true}></Input>
                  <StyledCopyButtonContainer>
                    <Button onClick={copyUrl} type="primary" shape="circle">
                      {t('Copy Link')}
                    </Button>
                  </StyledCopyButtonContainer>
                </StyledPublishCopyContainer>
              </>
            ) : (
              <StyledPublishExplanation>
                {'Publishing Description'}
              </StyledPublishExplanation>
            )}
          </StyledPublishContent>
          {workspace.isPublish ? (
            <Button
              onClick={() => {
                togglePublic(false);
              }}
              type="primary"
              shape="circle"
            >
              {t('Stop publishing')}
            </Button>
          ) : (
            <Button
              onClick={() => {
                togglePublic(true);
              }}
              type="primary"
              shape="circle"
            >
              {t('Publish to web')}
            </Button>
          )}
        </div>
      ) : (
        <StyledPublishContent>
          <>
            <StyledPublishExplanation>
              {t('Publishing')}
            </StyledPublishExplanation>

            <StyledPublishCopyContainer>
              <Button
                onClick={() => {
                  enableAffineCloud();
                }}
                type="primary"
                shape="circle"
              >
                {t('Enable AFFiNE Cloud')}
              </Button>
            </StyledPublishCopyContainer>
          </>
        </StyledPublishContent>
      )}
    </>
  );
};
