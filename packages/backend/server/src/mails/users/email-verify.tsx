import { Bold, Button, Content, P, Template, Title } from '../components';

export type VerifyEmailProps = {
  url: string;
};

export default function VerifyEmail(props: VerifyEmailProps) {
  return (
    <Template>
      <Title>Verify your email address</Title>
      <Content>
        <P>
          You recently requested to verify the email address associated with
          your AFFiNE account.
          <br />
          To complete this process, please click on the verification link below.
        </P>
        <P>
          This magic link will expire in <Bold>30 minutes</Bold>.
        </P>
        <Button href={props.url}>Verify your email address</Button>
      </Content>
    </Template>
  );
}

VerifyEmail.PreviewProps = {
  url: 'https://app.affine.pro',
};
