import React, { useState } from 'react';
import Modal, { ModalCloseButton, ModalWrapper } from '@/ui/modal';
import getIsMobile from '@/utils/get-is-mobile';
import { StyledButton, StyledContent, StyledTitle } from './styles';
import bg from './bg.png';
export const MobileModal = () => {
  const [showModal, setShowModal] = useState(getIsMobile());
  return (
    <Modal
      open={showModal}
      onClose={() => {
        setShowModal(false);
      }}
    >
      <ModalWrapper
        width={348}
        height={388}
        style={{ backgroundImage: `url(${bg.src})` }}
      >
        <ModalCloseButton
          size={[30, 30]}
          iconSize={[20, 20]}
          onClick={() => {
            setShowModal(false);
          }}
        />

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
