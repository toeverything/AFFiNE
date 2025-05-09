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

export type TeamBecomeCollaboratorProps = {
  workspace: WorkspaceProps;
  url: string;
};

export default function TeamBecomeCollaborator(
  props: TeamBecomeCollaboratorProps
) {
  const { workspace, url } = props;

  return (
    <Template>
      <Title>Role update in workspace</Title>
      <Content>
        <P>
          Your role in <Workspace {...workspace} /> has been changed to{' '}
          collaborator. You can continue to collaborate in this workspace.
        </P>
        <Button href={url}>Go to Workspace</Button>
      </Content>
    </Template>
  );
}

TeamBecomeCollaborator.PreviewProps = {
  workspace: TEST_WORKSPACE,
  role: 'admin',
  url: 'https://app.affine.pro',
};
