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

export type TeamWorkspaceUpgradedProps = {
  workspace: WorkspaceProps;
  isOwner: boolean;
  url: string;
};

export default function TeamWorkspaceUpgraded(
  props: TeamWorkspaceUpgradedProps
) {
  const { workspace, isOwner, url } = props;

  return (
    <Template>
      <Title>Welcome to the team workspace!</Title>
      <Content>
        <P>
          {isOwner ? (
            <>
              <Workspace {...workspace} /> has been upgraded to team workspace
              with the following benefits:
            </>
          ) : (
            <>
              Great news! <Workspace {...workspace} /> has been upgraded to team
              workspace by the workspace owner.
              <br />
              You now have access to the following enhanced features:
            </>
          )}
          <br /> ✓ 100 GB initial storage + 20 GB per seat
          <br /> ✓ 500 MB of maximum file size
          <br /> ✓ Unlimited team members (10+ seats)
          <br /> ✓ Multiple admin roles
          <br /> ✓ Priority customer support
        </P>
        <Button href={url}>Open Workspace</Button>
      </Content>
    </Template>
  );
}

TeamWorkspaceUpgraded.PreviewProps = {
  workspace: TEST_WORKSPACE,
  isOwner: true,
  url: 'https://app.affine.pro',
};
