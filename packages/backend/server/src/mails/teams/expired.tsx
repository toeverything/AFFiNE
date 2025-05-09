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

export interface TeamExpiredProps {
  workspace: WorkspaceProps;
  expirationDate: Date;
  url: string;
}

export default function TeamExpired(props: TeamExpiredProps) {
  const { workspace, expirationDate, url } = props;

  return (
    <Template>
      <Title>Team workspace expired</Title>
      <Content>
        <P>
          Your <Workspace {...workspace} /> team workspace expired on{' '}
          <IOSDate value={expirationDate} />. Your workspace can&apos;t sync or
          collaborate with team members. Please renew your subscription to
          restore all team features.
        </P>
        <Button href={url}>Go to Billing</Button>
      </Content>
    </Template>
  );
}

TeamExpired.PreviewProps = {
  workspace: TEST_WORKSPACE,
  expirationDate: new Date('2025-01-01T00:00:00Z'),
  url: 'https://app.affine.pro',
};
