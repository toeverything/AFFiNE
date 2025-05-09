import { TEST_WORKSPACE } from '../common';
import {
  Content,
  P,
  Template,
  Title,
  Workspace,
  type WorkspaceProps,
} from '../components';

export type OwnershipReceivedProps = {
  workspace: WorkspaceProps;
};

export default function OwnershipReceived(props: OwnershipReceivedProps) {
  const { workspace } = props;

  return (
    <Template>
      <Title>Welcome, new workspace owner!</Title>
      <Content>
        <P>
          You have been assigned as the owner of
          <Workspace {...workspace} />. As a workspace owner, you have full
          control over this workspace.
        </P>
      </Content>
    </Template>
  );
}

OwnershipReceived.PreviewProps = {
  workspace: TEST_WORKSPACE,
};
