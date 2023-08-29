import { Modal, ModalWrapper } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloseIcon } from '@blocksuite/icons';
import { Button, IconButton } from '@toeverything/components/button';

import { ButtonContainer, Content, Header, StyleTips, Title } from './style';

interface EnableAffineCloudModalProps {
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const EnableAffineCloudModal = ({
  onConfirm,
  open,
  onClose,
}: EnableAffineCloudModalProps) => {
  const t = useAFFiNEI18N();

  return (
    <Modal open={open} onClose={onClose} data-testid="logout-modal">
      <ModalWrapper width={480}>
        <Header>
          <Title>{t['Enable AFFiNE Cloud']()}</Title>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Header>
        <Content>
          <StyleTips>{t['Enable AFFiNE Cloud Description']()}</StyleTips>
          <ButtonContainer>
            <div>
              <Button onClick={onClose} block>
                {t['Cancel']()}
              </Button>
            </div>
            <div>
              <Button
                data-testid="confirm-enable-affine-cloud-button"
                type="primary"
                block
                onClick={onConfirm}
              >
                {t['Sign in and Enable']()}
              </Button>
            </div>
          </ButtonContainer>
        </Content>
      </ModalWrapper>
    </Modal>
  );
};
