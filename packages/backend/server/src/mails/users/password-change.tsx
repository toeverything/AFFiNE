import { Bold, Button, Content, P, Template, Title } from '../components';

export type ChangePasswordProps = {
  url: string;
};

export default function ChangePassword(props: ChangePasswordProps) {
  return (
    <Template>
      <Title>Modify your AFFiNE password</Title>
      <Content>
        <P>
          Click the button below to reset your password. The magic link will
          expire in <Bold>30 minutes</Bold>.
        </P>
        <Button href={props.url}>Set new password</Button>
      </Content>
    </Template>
  );
}

ChangePassword.PreviewProps = {
  url: 'https://app.affine.pro',
};
