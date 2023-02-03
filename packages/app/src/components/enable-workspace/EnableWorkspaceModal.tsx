import { styled } from '@/styles';
import { Modal, ModalWrapper, ModalCloseButton } from '@/ui/modal';
import { Button } from '@/ui/button';
import { useTranslation } from '@affine/i18n';
import { useAppState } from '@/providers/app-state-provider';
import { useState } from 'react';
import router from 'next/router';
import { toast } from '@/ui/toast';
interface EnableWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
}

export const EnableWorkspaceModal = ({
  open,
  onClose,
}: EnableWorkspaceModalProps) => {
  const { t } = useTranslation();
  const { user, dataCenter, login, currentWorkspace } = useAppState();
  const [loading, setLoading] = useState(false);
  return (
    <Modal open={open} onClose={onClose} data-testid="logout-modal">
      <ModalWrapper width={560} height={292}>
        <Header>
          <ModalCloseButton
            onClick={() => {
              onClose();
            }}
          />
        </Header>
        <Content>
          <ContentTitle>{t('Enable AFFiNE Cloud')}?</ContentTitle>
          <StyleTips>{t('Enable AFFiNE Cloud Description')}</StyleTips>
          {/* <StyleTips>{t('Retain local cached data')}</StyleTips> */}
          <div>
            <StyleButton
              shape="round"
              type="primary"
              loading={loading}
              onClick={async () => {
                setLoading(true);
                if (!user) {
                  await login();
                }
                if (currentWorkspace) {
                  const workspace = await dataCenter.enableWorkspaceCloud(
                    currentWorkspace
                  );
                  workspace &&
                    router.push(`/workspace/${workspace.id}/setting`);
                  toast(t('Enabled success'));
                }
              }}
            >
              {user ? t('Enable') : t('Sign in and Enable')}
            </StyleButton>
            <StyleButton
              shape="round"
              onClick={() => {
                onClose();
              }}
            >
              {t('Skip')}
            </StyleButton>
          </div>
        </Content>
      </ModalWrapper>
    </Modal>
  );
};

const Header = styled('div')({
  height: '44px',
  display: 'flex',
  flexDirection: 'row-reverse',
  paddingRight: '10px',
  paddingTop: '10px',
});

const Content = styled('div')({
  textAlign: 'center',
});

const ContentTitle = styled('h1')({
  fontSize: '20px',
  lineHeight: '28px',
  fontWeight: 600,
  textAlign: 'center',
  paddingBottom: '16px',
});

const StyleTips = styled('div')(() => {
  return {
    userSelect: 'none',
    width: '400px',
    marginBottom: '32px',
    marginTop: '16px',
  };
});

const StyleButton = styled(Button)(() => {
  return {
    width: '284px',
    display: 'block',
    margin: 'auto',
    marginTop: '16px',
  };
});
