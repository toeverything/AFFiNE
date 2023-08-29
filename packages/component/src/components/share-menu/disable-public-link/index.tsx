import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloseIcon } from '@blocksuite/icons';
import { Button, IconButton } from '@toeverything/components/button';

import { Modal, ModalWrapper } from '../../..';
import { ButtonContainer, Content, Header, StyleTips, Title } from './style';

export type PublicLinkDisableProps = {
  open: boolean;
  onConfirmDisable: () => void;
  onClose: () => void;
};

export const PublicLinkDisableModal = ({
  open,
  onConfirmDisable,
  onClose,
}: PublicLinkDisableProps) => {
  const t = useAFFiNEI18N();
  return (
    <Modal open={open} onClose={onClose}>
      <ModalWrapper width={480}>
        <Header>
          <Title>{t['Disable Public Link']()}</Title>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Header>
        <Content>
          <StyleTips>{t['Disable Public Link Description']()}</StyleTips>
          <ButtonContainer>
            <div>
              <Button onClick={onClose} block>
                {t['Cancel']()}
              </Button>
            </div>
            <div>
              <Button
                data-testid="confirm-enable-affine-cloud-button"
                type="error"
                block
                onClick={() => {
                  onConfirmDisable();
                  onClose();
                }}
              >
                {t['Disable']()}
              </Button>
            </div>
          </ButtonContainer>
        </Content>
      </ModalWrapper>
    </Modal>
  );
};
