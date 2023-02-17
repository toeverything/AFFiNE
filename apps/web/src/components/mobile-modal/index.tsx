import { Modal, ModalCloseButton, ModalWrapper } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import React, { useState } from 'react';

import getIsMobile from '@/utils/get-is-mobile';

import bg from './bg.png';
import { StyledButton, StyledContent, StyledTitle } from './styles';
export const MobileModal = () => {
  const [showModal, setShowModal] = useState(getIsMobile());
  const { t } = useTranslation();
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

        <StyledTitle>{t('Ooops!')}</StyledTitle>
        <StyledContent>
          <p>{t('mobile device')}</p>
          <p>{t('mobile device description')}</p>
        </StyledContent>
        <StyledButton
          onClick={() => {
            setShowModal(false);
          }}
        >
          {t('Got it')}
        </StyledButton>
      </ModalWrapper>
    </Modal>
  );
};

export default MobileModal;
