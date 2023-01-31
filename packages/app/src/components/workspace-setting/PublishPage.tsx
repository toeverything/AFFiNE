import {
  StyledCopyButtonContainer,
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
      setLoaded(false);
    } catch (e) {
      toast('Failed to publish workspace');
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(shareUrl);
    toast('Copied url to clipboard');
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
                  The current workspace has been published to the web, everyone
                  can view the contents of this workspace through the link.
                </StyledPublishExplanation>

                <StyledPublishCopyContainer>
                  <StyledSettingH2 marginBottom={16}>
                    {t('Share with link')}
                  </StyledSettingH2>
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
                {t('Publishing Description')}
                <div style={{ marginTop: '64px' }}>
                  <Button
                    onClick={async () => {
                      setLoaded(true);
                      await togglePublic(true);
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
              Publishing to web requires AFFiNE Cloud service.
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
