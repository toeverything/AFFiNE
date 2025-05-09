import { Content, Name, P, Template, Title } from '../components';

export type ChangeEmailNotificationProps = {
  to: string;
};

export default function ChangeEmailNotification(
  props: ChangeEmailNotificationProps
) {
  return (
    <Template>
      <Title>Verify your current email for AFFiNE</Title>
      <Content>
        <P>
          As per your request, we have changed your email. Please make sure
          you&apos;re using <Name>{props.to}</Name> to log in the next time.
        </P>
      </Content>
    </Template>
  );
}

ChangeEmailNotification.PreviewProps = {
  to: 'test@affine.pro',
};
