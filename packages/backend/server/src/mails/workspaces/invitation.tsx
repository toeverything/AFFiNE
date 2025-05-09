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

export type InvitationProps = {
  user: UserProps;
  workspace: WorkspaceProps;
  url: string;
};

export default function Invitation(props: InvitationProps) {
  const { user, workspace, url } = props;

  return (
    <Template>
      <Title>You are invited!</Title>
      <Content>
        <P>
          <User {...user} /> invited you to join <Workspace {...workspace} />
        </P>
        <P>Click button to join this workspace</P>
        <Button href={url}>Accept & Join</Button>
      </Content>
    </Template>
  );
}

Invitation.PreviewProps = {
  user: TEST_USER,
  workspace: TEST_WORKSPACE,
  url: 'https://app.affine.pro',
};
