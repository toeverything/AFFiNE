import React, { useState } from 'react';
import Modal from '@/ui/modal';
import getIsMobile from '@/utils/get-is-mobile';
import {
  ModalWrapper,
  StyledButton,
  StyledCloseButton,
  StyledContent,
  StyledTitle,
} from './styles';
import CloseIcon from '@mui/icons-material/Close';
export const MobileModal = () => {
  const [showModal, setShowModal] = useState(getIsMobile());
  return (
    <Modal
      open={showModal}
      onClose={() => {
        setShowModal(false);
      }}
    >
      <ModalWrapper>
        <StyledCloseButton
          onClick={() => {
            setShowModal(false);
          }}
        >
          <CloseIcon />
        </StyledCloseButton>

        <StyledTitle>Ooops!</StyledTitle>
        <StyledContent>
          <p>Looks like you are browsing on a mobile device.</p>
          <p>
            We are still working on mobile support and recommend you use a
            desktop device.
          </p>
        </StyledContent>
        <StyledButton
          onClick={() => {
            setShowModal(false);
          }}
        >
          Got it
        </StyledButton>
      </ModalWrapper>
    </Modal>
  );
};

export default MobileModal;
