import { IconButton, Modal, ModalWrapper } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
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
  const t = useAFFiNEI18N();
  const user = useCurrentUser();

  return (
    <Modal
      open={open}
      onClose={onClose}
      data-testid="enable-affine-cloud-modal"
    >
      <ModalWrapper width={560} height={292}>
        <Header>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Header>
        <Content>
          <ContentTitle>{t['Enable AFFiNE Cloud']()}?</ContentTitle>
          <StyleTips>{t['Enable AFFiNE Cloud Description']()}</StyleTips>
          {/* <StyleTips>{t('Retain cached cloud data')}</StyleTips> */}
          <div>
            <StyleButton
              data-testid="confirm-enable-cloud-button"
              shape="round"
              type="primary"
              onClick={onConform}
            >
              {user ? t['Enable']() : t['Sign in and Enable']()}
            </StyleButton>
            <StyleButton
              shape="round"
              onClick={() => {
                onClose();
              }}
            >
              {t['Not now']()}
            </StyleButton>
          </div>
        </Content>
      </ModalWrapper>
    </Modal>
  );
};
