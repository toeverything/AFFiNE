import { Modal, ModalWrapper } from '@affine/component';
import { IconButton } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { useState } from 'react';
import router from 'next/router';
import { toast } from '@affine/component';
import { CloseIcon } from '@blocksuite/icons';
import { useGlobalState } from '@/store/app';
import { Header, Content, ContentTitle, StyleTips, StyleButton } from './style';

interface EnableWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
}

export const EnableWorkspaceModal = ({
  open,
  onClose,
}: EnableWorkspaceModalProps) => {
  const { t } = useTranslation();
  const login = useGlobalState(store => store.login);
  const user = useGlobalState(store => store.user);
  const dataCenter = useGlobalState(store => store.dataCenter);
  const currentWorkspace = useGlobalState(
    useCallback(store => store.currentDataCenterWorkspace, [])
  );
  const [loading, setLoading] = useState(false);
  return (
    <Modal open={open} onClose={onClose} data-testid="logout-modal">
      <ModalWrapper width={560} height={292}>
        <Header>
          <IconButton
            onClick={() => {
              onClose();
            }}
          >
            <CloseIcon />
          </IconButton>
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
              {t('Not now')}
            </StyleButton>
          </div>
        </Content>
      </ModalWrapper>
    </Modal>
  );
};
