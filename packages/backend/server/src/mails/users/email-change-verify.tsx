import { Button, Content, P, Template, Title } from '../components';

export type VerifyChangeEmailProps = {
  url: string;
};

export default function VerifyChangeEmail(props: VerifyChangeEmailProps) {
  return (
    <Template>
      <Title>Verify your new email address</Title>
      <Content>
        <P>
          You recently requested to change the email address associated with
          your AFFiNE account. To complete this process, please click on the
          verification link below. This magic link will expire in 30 minutes.
        </P>
        <Button href={props.url}>Verify your new email address</Button>
      </Content>
    </Template>
  );
}

VerifyChangeEmail.PreviewProps = {
  url: 'https://app.affine.pro',
};
