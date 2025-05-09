import { TEST_WORKSPACE } from '../common';
import {
  Content,
  P,
  Template,
  Title,
  Workspace,
  type WorkspaceProps,
} from '../components';

export type OwnershipTransferredProps = {
  workspace: WorkspaceProps;
};

export default function OwnershipTransferred(props: OwnershipTransferredProps) {
  const { workspace } = props;
  return (
    <Template>
      <Title>Ownership transferred</Title>
      <Content>
        <P>
          You have transferred ownership of <Workspace {...workspace} />. You
          are now a collaborator in this workspace.
        </P>
      </Content>
    </Template>
  );
}

OwnershipTransferred.PreviewProps = {
  workspace: TEST_WORKSPACE,
};
