import { TEST_WORKSPACE } from '../common';
import {
  Button,
  Content,
  P,
  Template,
  Title,
  Workspace,
  type WorkspaceProps,
} from '../components';

export type LinkInvitationApprovedProps = {
  workspace: WorkspaceProps;
  url: string;
};

export default function LinkInvitationApproved(
  props: LinkInvitationApprovedProps
) {
  const { workspace, url } = props;
  return (
    <Template>
      <Title>Welcome to the workspace!</Title>
      <Content>
        <P>
          Your request to join <Workspace {...workspace} /> has been accepted.
          You can now access the team workspace and collaborate with other
          members.
        </P>
      </Content>
      <Button href={url}>Open Workspace</Button>
    </Template>
  );
}

LinkInvitationApproved.PreviewProps = {
  workspace: TEST_WORKSPACE,
  url: 'https://app.affine.pro',
};
