import { TEST_WORKSPACE } from '../common';
import {
  Content,
  P,
  Template,
  Title,
  Workspace,
  type WorkspaceProps,
} from '../components';

export interface TeamWorkspaceDeletedProps {
  workspace: WorkspaceProps;
}

export default function TeamWorkspaceDeleted(props: TeamWorkspaceDeletedProps) {
  const { workspace } = props;

  return (
    <Template>
      <Title>Workspace data deleted</Title>
      <Content>
        <P>
          All data in <Workspace {...workspace} /> has been permanently deleted
          as the workspace remained expired for 180 days. This action cannot be
          undone.
        </P>
        <P>
          Thank you for your support of AFFiNE. We hope to see you again in the
          future.
        </P>
      </Content>
    </Template>
  );
}

TeamWorkspaceDeleted.PreviewProps = {
  workspace: TEST_WORKSPACE,
};
