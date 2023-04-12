import { useCallback } from 'react';

import { Button, Modal, ModalCloseButton, toast } from '../../..';
import {
  StyledButtonContent,
  StyledModalHeader,
  StyledModalWrapper,
  StyledTextContent,
} from './style';

interface PublicLinkDisableProps {
  open: boolean;
  onClose: () => void;
  onDisablePublicLink: () => void;
}

export const PublicLinkDisableModal = ({
  open,
  onClose,
  onDisablePublicLink,
}: PublicLinkDisableProps) => {
  const handleDisable = useCallback(() => {
    onDisablePublicLink();
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
          <Button shape="circle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            data-testid="disable-public-link-confirm-button"
            onClick={handleDisable}
            type="danger"
            shape="circle"
            style={{ marginLeft: '24px' }}
          >
            Disable
          </Button>
        </StyledButtonContent>
      </StyledModalWrapper>
    </Modal>
  );
};
