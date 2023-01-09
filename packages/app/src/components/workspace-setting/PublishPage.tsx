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

export const PublishPage = ({ workspace }: { workspace: Workspace }) => {
  const shareUrl =
    window.location.host + '/workspace/' + workspace.id + '?share=true';
  const { publishWorkspace } = useWorkspaceHelper();

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
      title: 'Enable AFFiNE Cloud?',
      content: `If enabled, the data in this workspace will be backed up and synchronized via AFFiNE Cloud.`,
      confirmText:
        workspace.provider === 'local' ? 'Enable' : 'Sign in and Enable',
      cancelText: 'Skip',
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
