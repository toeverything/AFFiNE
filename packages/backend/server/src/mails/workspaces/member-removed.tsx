import { TEST_WORKSPACE } from '../common';
import {
  Content,
  P,
  Template,
  Title,
  Workspace,
  type WorkspaceProps,
} from '../components';

export type MemberRemovedProps = {
  workspace: WorkspaceProps;
};

export default function MemberRemoved(props: MemberRemovedProps) {
  const { workspace } = props;
  return (
    <Template>
      <Title>Workspace access removed</Title>
      <Content>
        <P>
          You have been removed from <Workspace {...workspace} />. You no longer
          have access to this workspace.
        </P>
      </Content>
    </Template>
  );
}

MemberRemoved.PreviewProps = {
  workspace: TEST_WORKSPACE,
};
