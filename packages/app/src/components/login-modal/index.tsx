import { styled } from '@/styles';
import { Modal, ModalWrapper, ModalCloseButton } from '@/ui/modal';
import { GoogleLoginButton } from './LoginOptionButton';
import { useAppState } from '@/providers/app-state-provider';
import { useTranslation } from '@affine/i18n';
interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export const LoginModal = ({ open, onClose }: LoginModalProps) => {
  const { login } = useAppState();
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} data-testid="login-modal">
      <ModalWrapper width={560} height={292}>
        <Header>
          <ModalCloseButton
            onClick={() => {
              onClose();
            }}
          />
        </Header>
        <Content>
          <ContentTitle>{t('Sign in')}</ContentTitle>
          <SignDes>{t('Set up an AFFiNE account to sync data')}</SignDes>
          <span
            onClick={async () => {
              await login();
              onClose();
            }}
          >
            <GoogleLoginButton />
          </span>
        </Content>
      </ModalWrapper>
    </Modal>
  );
};

const Header = styled('div')({
  position: 'relative',
  height: '44px',
});

const Content = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
});

const ContentTitle = styled('h1')({
  fontSize: '20px',
  lineHeight: '28px',
  fontWeight: 600,
  textAlign: 'center',
  paddingBottom: '16px',
});

const SignDes = styled('div')(({ theme }) => {
  return {
    fontWeight: 400,
    color: theme.colors.textColor,
    fontSize: '16px',
  };
});
