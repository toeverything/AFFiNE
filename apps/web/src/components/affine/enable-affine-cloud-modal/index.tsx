import { IconButton, Modal, ModalWrapper } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { CloseIcon } from '@blocksuite/icons';
import React from 'react';

import { useCurrentUser } from '../../../hooks/current/use-current-user';
import { Content, ContentTitle, Header, StyleButton, StyleTips } from './style';

interface EnableAffineCloudModalProps {
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const EnableAffineCloudModal: React.FC<EnableAffineCloudModalProps> = ({
  onConfirm,
  open,
  onClose,
}) => {
  const { t } = useTranslation();
  const user = useCurrentUser();

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
          {/* <StyleTips>{t('Retain cached cloud data')}</StyleTips> */}
          <div>
            <StyleButton
              shape="round"
              type="primary"
              onClick={() => {
                onConfirm();
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
