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
// import { useAppState } from '@/providers/app-state-provider3';
import { WorkspaceUnit } from '@affine/datacenter';
import { useWorkspaceHelper } from '@/hooks/use-workspace-helper';

export const PublishPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
  const shareUrl =
    window.location.host + '/workspace/' + workspace.id + '?share=true';
  const { publishWorkspace, enableWorkspace } = useWorkspaceHelper();

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
            {workspace?.published ? (
              <>
                <StyledPublishExplanation>
                  Publishing to web requires AFFiNE Cloud service .
                </StyledPublishExplanation>
                <StyledSettingH2>Share with link</StyledSettingH2>
                <StyledPublishCopyContainer>
                  <Input width={500} value={shareUrl} disabled={true}></Input>
                  <StyledCopyButtonContainer>
                    <Button onClick={copyUrl} type="primary" shape="circle">
                      Copy Link
                    </Button>
                  </StyledCopyButtonContainer>
                </StyledPublishCopyContainer>
              </>
            ) : (
              <StyledPublishExplanation>
                After publishing to the web, everyone can view the content of
                this workspace through the link.
              </StyledPublishExplanation>
            )}
          </StyledPublishContent>
          {workspace.published ? (
            <Button
              onClick={() => {
                togglePublic(false);
              }}
              type="primary"
              shape="circle"
            >
              Stop publishing
            </Button>
          ) : (
            <Button
              onClick={() => {
                togglePublic(true);
              }}
              type="primary"
              shape="circle"
            >
              Publish to web
            </Button>
          )}
        </div>
      ) : (
        <StyledPublishContent>
          <>
            <StyledPublishExplanation>
              Publishing to web requires AFFiNE Cloud service.
            </StyledPublishExplanation>

            <StyledPublishCopyContainer>
              <Button
                onClick={() => {
                  enableAffineCloud();
                }}
                type="primary"
                shape="circle"
              >
                Enable AFFiNE Cloud
              </Button>
            </StyledPublishCopyContainer>
          </>
        </StyledPublishContent>
      )}
    </>
  );
};
