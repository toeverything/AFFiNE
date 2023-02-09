import { positionAbsolute, styled } from '@/styles';
import { Modal, ModalWrapper, ModalCloseButton } from '@/ui/modal';
import { Button } from '@/ui/button';
import { useAppState } from '@/providers/app-state-provider';
import { useTranslation } from '@affine/i18n';
import { GoogleIcon } from './GoogleIcon';
interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export const LoginModal = ({ open, onClose }: LoginModalProps) => {
  const { login } = useAppState();
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} data-testid="login-modal">
      <ModalWrapper width={560} height={292} style={{ paddingTop: '44px' }}>
        <ModalCloseButton
          onClick={() => {
            onClose();
          }}
        />
        <Content>
          <ContentTitle>{t('Sign in')}</ContentTitle>
          <SignDes>{t('Set up an AFFiNE account to sync data')}</SignDes>
          <StyledLoginButton
            shape="round"
            onClick={async () => {
              await login();
              onClose();
            }}
          >
            <GoogleIcon />
            {t('Continue with Google')}
          </StyledLoginButton>
        </Content>
      </ModalWrapper>
    </Modal>
  );
};

const StyledLoginButton = styled(Button)(() => {
  return {
    width: '284px',
    marginTop: '30px',
    position: 'relative',
    svg: {
      ...positionAbsolute({ left: '18px', top: '0', bottom: '0' }),
      margin: 'auto',
    },
  };
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
