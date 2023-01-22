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
// import { useAppState } from '@/providers/app-state-provider3';
import { WorkspaceUnit } from '@affine/datacenter';
import { useWorkspaceHelper } from '@/hooks/use-workspace-helper';
import { useTranslation } from '@affine/i18n';
import Loading from '@/components/loading';
import { Wrapper } from '@/ui/layout';
export const PublishPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
  const shareUrl = window.location.host + '/public-workspace/' + workspace.id;
  const { publishWorkspace, enableWorkspace } = useWorkspaceHelper();
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(true);
  const togglePublic = async (flag: boolean) => {
    await publishWorkspace(workspace.id.toString(), flag);
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(shareUrl);
    toast('Copied url to clipboard');
  };

  const enableAffineCloud = async () => {
    await enableWorkspace();
  };
  return (
    <>
      {workspace.provider === 'affine' ? (
        <div>
          <StyledPublishContent>
            {workspace.published ? (
              <>
                <StyledPublishExplanation>
                  {t('Publishing')}
                </StyledPublishExplanation>
                <StyledSettingH2 marginTop={48}>
                  {t('Share with link')}
                </StyledSettingH2>
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
                {t('Publishing Description')}
              </StyledPublishExplanation>
            )}
          </StyledPublishContent>

          {workspace.published ? (
            <StyledStopPublishContainer>
              <Button
                onClick={async () => {
                  setLoaded(false);
                  await togglePublic(false);
                  setLoaded(true);
                }}
                type="danger"
                shape="circle"
              >
                {t('Stop publishing')}
              </Button>
            </StyledStopPublishContainer>
          ) : (
            <StyledPublishCopyContainer>
              <Button
                onClick={async () => {
                  setLoaded(false);
                  await togglePublic(true);
                  setLoaded(true);
                }}
                type="primary"
                shape="circle"
              >
                {t('Publish to web')}
              </Button>
            </StyledPublishCopyContainer>
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
                onClick={async () => {
                  setLoaded(false);
                  await enableAffineCloud();
                  setLoaded(true);
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
      {!loaded && (
        <Wrapper>
          <Loading size={25} />
        </Wrapper>
      )}
    </>
  );
};
