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
import { Workspace } from '@/hooks/mock-data/mock';
import { useTemporaryHelper } from '@/providers/temporary-helper-provider';
import { useConfirm } from '@/providers/ConfirmProvider';

export const PublishPage = ({ workspace }: { workspace: Workspace }) => {
  console.log('workspace: ', workspace);
  const shareUrl =
    window.location.host + '/workspace/' + workspace.id + '?share=true';

  const { login, updateWorkspaceMeta, user } = useTemporaryHelper();
  const { confirm } = useConfirm();

  const togglePublic = (flag: boolean) => {
    updateWorkspaceMeta(workspace.id, { isPublish: flag });
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(shareUrl);
    toast('Copied url to clipboard');
  };

  const enableAffineCloud = () => {
    confirm({
      title: 'Enable AFFiNE Cloud?',
      content: `If enabled, the data in this workspace will be backed up and synchronized via AFFiNE Cloud.`,
      confirmText: user ? 'Enable' : 'Sign in and Enable',
      cancelText: 'Skip',
    }).then(confirm => {
      if (confirm) {
        if (user) {
          updateWorkspaceMeta(workspace.id, { type: 'cloud' });
        } else {
          login();
          updateWorkspaceMeta(workspace.id, { type: 'cloud' });
        }
      }
    });
  };
  return (
    <>
      {workspace.type === 'cloud' ? (
        <div>
          <StyledPublishContent>
            {workspace?.isPublish ? (
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
          {workspace.isPublish ? (
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
