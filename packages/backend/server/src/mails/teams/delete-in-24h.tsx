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

export interface TeamDeleteIn24HoursProps {
  workspace: WorkspaceProps;
  deletionDate: Date;
  url: string;
}

export default function TeamDeleteIn24Hours(props: TeamDeleteIn24HoursProps) {
  const { workspace, deletionDate, url } = props;

  return (
    <Template>
      <Title>Urgent: Last chance to prevent data loss</Title>
      <Content>
        <P>
          Your <Workspace {...workspace} /> team workspace data will be
          permanently deleted in 24 hours on <IOSDate value={deletionDate} />.
          To prevent data loss, please take immediate action:
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

TeamDeleteIn24Hours.PreviewProps = {
  workspace: TEST_WORKSPACE,
  deletionDate: new Date('2025-01-31T00:00:00Z'),
  url: 'https://app.affine.pro',
};
