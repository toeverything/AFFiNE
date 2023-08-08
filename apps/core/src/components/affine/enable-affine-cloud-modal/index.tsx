import { Modal, ModalWrapper, Wrapper } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloseIcon } from '@blocksuite/icons';
import { Button, IconButton } from '@toeverything/components/button';
import type React from 'react';

import { Content, ContentTitle, Header, StyleTips } from './style';

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
  const t = useAFFiNEI18N();

  return (
    <Modal open={open} onClose={onClose} data-testid="logout-modal">
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
          <Wrapper width={284} margin="auto">
            <Button
              data-testid="confirm-enable-affine-cloud-button"
              type="primary"
              block
              onClick={onConfirm}
              style={{
                marginBottom: '16px',
              }}
            >
              {t['Sign in and Enable']()}
            </Button>
            <Button onClick={onClose} block>
              {t['Not now']()}
            </Button>
          </Wrapper>
        </Content>
      </ModalWrapper>
    </Modal>
  );
};
