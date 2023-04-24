import { IconButton, Modal, ModalWrapper } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { CloseIcon } from '@blocksuite/icons';
import type React from 'react';

import { useCurrentUser } from '../../../hooks/current/use-current-user';
import { Content, ContentTitle, Header, StyleButton, StyleTips } from './style';

export type TransformWorkspaceToAffineModalProps = {
  open: boolean;
  onClose: () => void;
  onConform: () => void;
};

export const TransformWorkspaceToAffineModal: React.FC<
  TransformWorkspaceToAffineModalProps
> = ({ open, onClose, onConform }) => {
  const { t } = useTranslation();
  const user = useCurrentUser();

  return (
    <Modal
      open={open}
      onClose={onClose}
      data-testid="enable-affine-cloud-modal"
    >
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
          {/* <StyleTips>{t('Retain cached cloud data')}</StyleTips> */}
          <div>
            <StyleButton
              data-testid="confirm-enable-cloud-button"
              shape="round"
              type="primary"
              onClick={async () => {
                onConform();
                // setLoading(true);
                // if (user || (await login())) {
                //   if (currentWorkspace) {
                //     const workspace = await dataCenter.enableWorkspaceCloud(
                //       currentWorkspace
                //     );
                //     toast(t('Enabled success'));
                //
                //     if (workspace) {
                //       router.push(`/workspace/${workspace.id}/setting`);
                //     }
                //   }
                // }
                // setLoading(false);
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
