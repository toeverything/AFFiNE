import { TEST_WORKSPACE } from '../common';
import {
  Button,
  Content,
  IOSDate,
  P,
  Template,
  Title,
  Workspace,
  type WorkspaceProps,
} from '../components';

export interface TeamExpireSoonProps {
  workspace: WorkspaceProps;
  expirationDate: Date;
  url: string;
}

export default function TeamExpireSoon(props: TeamExpireSoonProps) {
  const { workspace, expirationDate, url } = props;

  return (
    <Template>
      <Title>Team workspace will expire soon</Title>
      <Content>
        <P>
          Your <Workspace {...workspace} /> team workspace will expire on{' '}
          <IOSDate value={expirationDate} />. After expiration, you won&apos;t
          be able to sync or collaborate with team members. Please renew your
          subscription to continue using all team features.
        </P>
        <Button href={url}>Go to Billing</Button>
      </Content>
    </Template>
  );
}

TeamExpireSoon.PreviewProps = {
  workspace: TEST_WORKSPACE,
  expirationDate: new Date('2025-01-01T00:00:00Z'),
  url: 'https://app.affine.pro',
};
