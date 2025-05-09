import { TEST_WORKSPACE } from '../common';
import {
  Content,
  P,
  Template,
  Title,
  Workspace,
  type WorkspaceProps,
} from '../components';

export type LinkInvitationReviewDeclinedProps = {
  workspace: WorkspaceProps;
};

export default function LinkInvitationReviewDeclined(
  props: LinkInvitationReviewDeclinedProps
) {
  const { workspace } = props;
  return (
    <Template>
      <Title>Request declined</Title>
      <Content>
        <P>
          Your request to join <Workspace {...workspace} /> has been declined by
          the workspace admin.
        </P>
      </Content>
    </Template>
  );
}

LinkInvitationReviewDeclined.PreviewProps = {
  workspace: TEST_WORKSPACE,
};
