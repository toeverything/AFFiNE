import { Bold, Button, Content, P, Template, Title } from '../components';

export type ChangeEmailProps = {
  url: string;
};

export default function ChangeEmail(props: ChangeEmailProps) {
  return (
    <Template>
      <Title>Verify your current email for AFFiNE</Title>
      <Content>
        <P>
          You recently requested to change the email address associated with
          your AFFiNE account.
          <br />
          To complete this process, please click on the verification link below.
        </P>
        <P>
          This magic link will expire in <Bold>30 minutes</Bold>.
        </P>
        <Button href={props.url}>Verify and set up a new email address</Button>
      </Content>
    </Template>
  );
}

ChangeEmail.PreviewProps = {
  url: 'https://app.affine.pro',
};
