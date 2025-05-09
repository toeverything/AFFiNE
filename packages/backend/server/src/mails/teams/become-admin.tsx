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

export type TeamBecomeAdminProps = {
  workspace: WorkspaceProps;
  url: string;
};

export default function TeamBecomeAdmin(props: TeamBecomeAdminProps) {
  const { workspace, url } = props;
  return (
    <Template>
      <Title>You&apos;ve been promoted to admin.</Title>
      <Content>
        <P>
          You have been promoted to admin of <Workspace {...workspace} />. As an
          admin, you can help the workspace owner manage members in this
          workspace.
        </P>
        <Button href={url}>Go to Workspace</Button>
      </Content>
    </Template>
  );
}

TeamBecomeAdmin.PreviewProps = {
  workspace: TEST_WORKSPACE,
  role: 'admin',
  url: 'https://app.affine.pro',
};
