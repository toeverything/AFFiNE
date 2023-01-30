import { styled } from '@/styles';
import { Modal, ModalWrapper, ModalCloseButton } from '@/ui/modal';
import { Button } from '@/ui/button';
import { Check, UnCheck } from './icon';
import { useState } from 'react';
interface LoginModalProps {
  open: boolean;
  onClose: (wait: boolean) => void;
}

export const LogoutModal = ({ open, onClose }: LoginModalProps) => {
  const [localCache, setLocalCache] = useState(false);
  return (
    <Modal open={open} onClose={onClose} data-testid="logout-modal">
      <ModalWrapper width={560} height={292}>
        <Header>
          <ModalCloseButton
            onClick={() => {
              onClose(true);
            }}
          />
        </Header>
        <Content>
          <ContentTitle>{'Sign out?'}</ContentTitle>
          <SignDes>Set up an AFFINE account to sync data</SignDes>
          <StyleTips>
            {localCache ? (
              <StyleCheck
                onClick={() => {
                  setLocalCache(false);
                }}
              >
                <Check></Check>
              </StyleCheck>
            ) : (
              <StyleCheck
                onClick={() => {
                  setLocalCache(true);
                }}
              >
                <UnCheck></UnCheck>
              </StyleCheck>
            )}
            Retain local cached data
          </StyleTips>
          <div>
            <Button
              style={{ marginRight: '16px' }}
              shape="round"
              onClick={() => {
                onClose(true);
              }}
            >
              Wait for Sync
            </Button>
            <Button
              type="danger"
              shape="round"
              onClick={() => {
                onClose(false);
              }}
            >
              Force Sign Out
            </Button>
          </div>
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

const StyleCheck = styled('span')(() => {
  return {
    display: 'inline-block',
    cursor: 'pointer',

    svg: {
      verticalAlign: 'sub',
      marginRight: '8px',
    },
  };
});

const StyleTips = styled('span')(() => {
  return {
    userSelect: 'none',
  };
});
