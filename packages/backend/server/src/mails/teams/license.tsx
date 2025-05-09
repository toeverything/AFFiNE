import {
  Bold,
  Content,
  OnelineCodeBlock,
  P,
  Template,
  Title,
} from '../components';

export interface TeamLicenseProps {
  license: string;
}

export default function TeamLicense(props: TeamLicenseProps) {
  const { license } = props;

  return (
    <Template>
      <Title>Here is your license key.</Title>
      <Content>
        <OnelineCodeBlock>{license}</OnelineCodeBlock>
        <P>
          You can use this key to upgrade your selfhost workspace in{' '}
          <Bold>Settings &gt; Workspace &gt; License</Bold>.
        </P>
      </Content>
    </Template>
  );
}

TeamLicense.PreviewProps = {
  license: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
};
