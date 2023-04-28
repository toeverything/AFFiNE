import { useTranslation } from '@affine/i18n';

import { Modal, ModalCloseButton } from '../../..';
import {
  StyledButton,
  StyledButtonContent,
  StyledDangerButton,
  StyledModalHeader,
  StyledModalWrapper,
  StyledTextContent,
} from './style';

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
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose}>
      <StyledModalWrapper>
        <ModalCloseButton onClick={onClose} top={12} right={12} />
        <StyledModalHeader>{t['Disable Public Link ?']()}</StyledModalHeader>

        <StyledTextContent>
          {t['Disable Public Link Description']()}
        </StyledTextContent>

        <StyledButtonContent>
          <StyledButton onClick={onClose}>{t['Cancel']()}</StyledButton>
          <StyledDangerButton
            data-testid="disable-public-link-confirm-button"
            onClick={onConfirmDisable}
            style={{ marginLeft: '24px' }}
          >
            {t['Disable']()}
          </StyledDangerButton>
        </StyledButtonContent>
      </StyledModalWrapper>
    </Modal>
  );
};
