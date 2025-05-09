import { TEST_WORKSPACE } from '../common';
import {
  Button,
  Content,
  IOSDate,
  P,
  Template,
  Text,
  Title,
  Workspace,
  type WorkspaceProps,
} from '../components';

export interface TeamDeleteInOneMonthProps {
  workspace: WorkspaceProps;
  expirationDate: Date;
  deletionDate: Date;
  url: string;
}

export default function TeamDeleteInOneMonth(props: TeamDeleteInOneMonthProps) {
  const { workspace, expirationDate, deletionDate, url } = props;

  return (
    <Template>
      <Title>Take action to prevent data loss</Title>
      <Content>
        <P>
          Your <Workspace {...workspace} /> team workspace expired on{' '}
          <IOSDate value={expirationDate} />. All workspace data will be
          permanently deleted on <IOSDate value={deletionDate} /> (180 days
          after expiration). To prevent data loss, please either:
          <li>
            <Text>Renew your subscription to restore team features</Text>
          </li>
          <li>
            <Text>
              Export your workspace data from Workspace Settings &gt; Export
              Workspace
            </Text>
          </li>
        </P>
        <Button href={url}>Go to Billing</Button>
      </Content>
    </Template>
  );
}

TeamDeleteInOneMonth.PreviewProps = {
  workspace: TEST_WORKSPACE,
  expirationDate: new Date('2025-01-01T00:00:00Z'),
  deletionDate: new Date('2025-01-31T00:00:00Z'),
  url: 'https://app.affine.pro',
};
