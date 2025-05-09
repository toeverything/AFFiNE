import { TEST_USER, TEST_WORKSPACE } from '../common';
import {
  Button,
  Content,
  P,
  Template,
  Title,
  User,
  type UserProps,
  Workspace,
  type WorkspaceProps,
} from '../components';

export type LinkInvitationReviewRequestProps = {
  workspace: WorkspaceProps;
  user: UserProps;
  url: string;
};

export default function LinkInvitationReviewRequest(
  props: LinkInvitationReviewRequestProps
) {
  const { workspace, user, url } = props;
  return (
    <Template>
      <Title>
        Request to join <Workspace {...workspace} size={24} />
      </Title>
      <Content>
        <P>
          <User {...user} /> has requested to join <Workspace {...workspace} />.
          <br />
          As a workspace owner/admin, you can approve or decline this request.
        </P>
        <Button href={url}>Review request</Button>
      </Content>
    </Template>
  );
}

LinkInvitationReviewRequest.PreviewProps = {
  workspace: TEST_WORKSPACE,
  user: TEST_USER,
  url: 'https://app.affine.pro',
};
