import { ResetIcon } from '@blocksuite/icons';
import { styled } from '@/styles';
import { Modal, ModalWrapper, ModalCloseButton } from '@/ui/modal';
import { TextButton } from '@/ui/button';
import { GoogleLoginButton, StayLogOutButton } from './LoginOptionButton';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export const LoginModal = ({ open, onClose }: LoginModalProps) => {
  return (
    <Modal open={open} onClose={onClose} data-testid="login-modal">
      <ModalWrapper width={620} height={334}>
        <Header>
          <ModalCloseButton
            top={6}
            right={6}
            onClick={() => {
              onClose();
            }}
          />
        </Header>
        <Content>
          <ContentTitle>Currently not logged in</ContentTitle>
          <GoogleLoginButton />
          <StayLogOutButton />
        </Content>
        <Footer>
          <TextButton icon={<StyledResetIcon />}>Clear local data</TextButton>
        </Footer>
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

const Footer = styled('div')({
  height: '70px',
  paddingLeft: '24px',
  marginTop: '32px',
});

const StyledResetIcon = styled(ResetIcon)({
  marginRight: '12px',
  width: '20px',
  height: '20px',
});
