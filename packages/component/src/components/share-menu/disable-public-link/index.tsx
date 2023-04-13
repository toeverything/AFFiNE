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
        <StyledModalHeader>Disable Public Link?</StyledModalHeader>

        <StyledTextContent>
          Disabling this public link will prevent anyone with the link from
          accessing this page.
        </StyledTextContent>

        <StyledButtonContent>
          <StyledButton onClick={onClose}>Cancel</StyledButton>
          <StyledDangerButton
            data-testid="disable-public-link-confirm-button"
            onClick={handleDisable}
            style={{ marginLeft: '24px' }}
          >
            Disable
          </StyledDangerButton>
        </StyledButtonContent>
      </StyledModalWrapper>
    </Modal>
  );
};
