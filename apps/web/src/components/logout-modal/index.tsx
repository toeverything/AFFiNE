import { styled } from '@affine/component';
import { Modal, ModalCloseButton, ModalWrapper } from '@affine/component';
import { Button } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { useGlobalState } from '@affine/store';
import { useState } from 'react';

import { Check, UnCheck } from './icon';
interface LoginModalProps {
  open: boolean;
  onClose: (wait: boolean) => void;
}

export const LogoutModal = ({ open, onClose }: LoginModalProps) => {
  const [localCache, setLocalCache] = useState(true);
  const blobDataSynced = useGlobalState(store => store.blobDataSynced);
  const { t } = useTranslation();

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
          <ContentTitle>{t('Sign out')}?</ContentTitle>
          <SignDes>
            {blobDataSynced
              ? t('Sign out description')
              : t('All data has been stored in the cloud')}
          </SignDes>
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
            {t('Retain cached cloud data')}
          </StyleTips>
          {blobDataSynced ? (
            <div>
              <Button
                type="danger"
                shape="round"
                style={{ marginRight: '16px' }}
                onClick={async () => {
                  onClose(false);
                }}
              >
                {t('Force Sign Out')}
              </Button>
              <Button
                shape="round"
                onClick={() => {
                  onClose(true);
                }}
              >
                {t('Wait for Sync')}
              </Button>
            </div>
          ) : (
            <div>
              <Button
                type="primary"
                style={{ marginRight: '16px' }}
                shape="round"
                onClick={() => {
                  onClose(true);
                }}
              >
                {t('Cancel')}
              </Button>
              <Button
                shape="round"
                onClick={() => {
                  onClose(false);
                }}
              >
                {t('Sign out')}
              </Button>
            </div>
          )}
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
