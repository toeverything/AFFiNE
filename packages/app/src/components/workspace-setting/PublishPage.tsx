import {
  StyledButtonContainer,
  StyledPublishContent,
  StyledPublishCopyContainer,
  StyledPublishExplanation,
  StyledSettingH2,
  StyledStopPublishContainer,
} from './style';
import { useState } from 'react';
import { Button } from '@/ui/button';
import Input from '@/ui/input';
import { toast } from '@/ui/toast';
// import { useAppState } from '@/providers/app-state-provider3';
import { WorkspaceUnit } from '@affine/datacenter';
import { useWorkspaceHelper } from '@/hooks/use-workspace-helper';
import { useTranslation } from '@affine/i18n';
import { EnableWorkspaceButton } from '../enable-workspace';
export const PublishPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
  const shareUrl = window.location.host + '/public-workspace/' + workspace.id;
  const { publishWorkspace } = useWorkspaceHelper();
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  const togglePublic = async (flag: boolean) => {
    try {
      await publishWorkspace(workspace.id.toString(), flag);
    } catch (e) {
      toast(t('Failed to publish workspace'));
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(shareUrl);
    toast(t('Copied link to clipboard'));
  };

  return (
    <>
      {workspace.provider === 'affine' ? (
        <div
          style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
          <StyledPublishContent>
            {workspace.published ? (
              <>
                <StyledPublishExplanation>
                  {t('Published Description')}
                </StyledPublishExplanation>

                <StyledPublishCopyContainer>
                  <StyledSettingH2 marginBottom={16}>
                    {t('Share with link')}
                  </StyledSettingH2>
                  <Input width={500} value={shareUrl} disabled={true}></Input>
                  <StyledButtonContainer>
                    <Button onClick={copyUrl} type="primary" shape="circle">
                      {t('Copy Link')}
                    </Button>
                  </StyledButtonContainer>
                </StyledPublishCopyContainer>
              </>
            ) : (
              <StyledPublishExplanation>
                {t('Publishing Description')}
                <div style={{ marginTop: '64px' }}>
                  <Button
                    onClick={async () => {
                      setLoaded(true);
                      await togglePublic(true);
                      setLoaded(false);
                    }}
                    loading={loaded}
                    type="primary"
                    shape="circle"
                  >
                    {t('Publish to web')}
                  </Button>
                </div>
              </StyledPublishExplanation>
            )}
          </StyledPublishContent>

          {workspace.published ? (
            <StyledStopPublishContainer>
              <Button
                onClick={async () => {
                  setLoaded(true);
                  await togglePublic(false);
                  setLoaded(true);
                }}
                loading={false}
                type="danger"
                shape="circle"
              >
                {t('Stop publishing')}
              </Button>
            </StyledStopPublishContainer>
          ) : (
            <></>
          )}
        </div>
      ) : (
        <StyledPublishContent>
          <>
            <StyledPublishExplanation>
              {t('Publishing')}
            </StyledPublishExplanation>

            <div style={{ marginTop: '72px' }}>
              <EnableWorkspaceButton></EnableWorkspaceButton>
            </div>
          </>
        </StyledPublishContent>
      )}
    </>
  );
};
