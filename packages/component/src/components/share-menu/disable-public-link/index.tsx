import { useTranslation } from '@affine/i18n';
import { useCallback } from 'react';

import { Modal, ModalCloseButton, toast } from '../../..';
import {
  StyledButton,
  StyledButtonContent,
  StyledDangerButton,
  StyledModalHeader,
  StyledModalWrapper,
  StyledTextContent,
} from './style';

export type PublicLinkDisableProps = {
  pageId: string;
  open: boolean;
  onClose: () => void;
};

export const PublicLinkDisableModal = ({
  pageId,
  open,
  onClose,
}: PublicLinkDisableProps) => {
  const { t } = useTranslation();
  const handleDisable = useCallback(() => {
    //TODO: disable public link
    console.log('disable', pageId);
    toast('Successfully disabled', {
      portal: document.body,
    });
  }, []);
  return (
    <Modal open={open} onClose={onClose}>
      <StyledModalWrapper>
        <ModalCloseButton onClick={onClose} top={12} right={12} />
        <StyledModalHeader>{t('Disable Public Link ?')}</StyledModalHeader>

        <StyledTextContent>
          {t('Disable Public Link Description')}
        </StyledTextContent>

        <StyledButtonContent>
          <StyledButton onClick={onClose}>{t('Cancel')}</StyledButton>
          <StyledDangerButton
            data-testid="disable-public-link-confirm-button"
            onClick={handleDisable}
            style={{ marginLeft: '24px' }}
          >
            {t('Disable')}
          </StyledDangerButton>
        </StyledButtonContent>
      </StyledModalWrapper>
    </Modal>
  );
};
