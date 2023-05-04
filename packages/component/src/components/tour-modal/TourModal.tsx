import type { FC } from 'react';
import { useState } from 'react';

import { Button, Modal, ModalCloseButton, ModalWrapper } from '../..';
import {
  buttonContainerStyle,
  buttonStyle,
  modalStyle,
  titleStyle,
  videoContainerStyle,
  videoStyle,
} from './index.css';

type TourModalProps = {
  open: boolean;
  onClose: () => void;
};

export const TourModal: FC<TourModalProps> = ({ open, onClose }) => {
  const [step, setStep] = useState(0);
  const handleClose = () => {
    setStep(0);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={handleClose}
      wrapperPosition={['center', 'center']}
      hideBackdrop
    >
      <ModalWrapper width={545} height={442} data-testid="onboarding-modal">
        <ModalCloseButton
          top={10}
          right={10}
          onClick={handleClose}
          data-testid="onboarding-modal-close-button"
        />
        {step === 0 && (
          <div className={modalStyle}>
            <div className={titleStyle}>Hyper merged whiteboard and docs</div>
            <div className={videoContainerStyle}>
              <video
                autoPlay
                muted
                loop
                className={videoStyle}
                data-testid="onboarding-modal-switch-video"
              >
                <source src="/switchVideo.mp4" type="video/mp4" />
                <source src="/switchVideo.webm" type="video/webm" />
                Easily switch between Page mode for structured document creation
                and Whiteboard mode for the freeform visual expression of
                creative ideas.
              </video>
            </div>
            <div className={buttonContainerStyle}>
              <Button
                className={buttonStyle}
                onClick={() => setStep(1)}
                data-testid="onboarding-modal-next-button"
              >
                Next Tip Please !
              </Button>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className={modalStyle}>
            <div className={titleStyle}>
              Intuitive & robust block-based editing
            </div>
            <div className={videoContainerStyle}>
              <video
                autoPlay
                muted
                loop
                className={videoStyle}
                data-testid="onboarding-modal-editing-video"
              >
                <source src="/editingVideo.mp4" type="video/mp4" />
                <source src="/editingVideo.webm" type="video/webm" />
                Create structured documents with ease, using a modular interface
                to drag and drop blocks of text, images, and other content.
              </video>
            </div>
            <div className={buttonContainerStyle}>
              <Button
                className={buttonStyle}
                onClick={handleClose}
                data-testid="onboarding-modal-ok-button"
              >
                Okay, I Like It !
              </Button>
            </div>
          </div>
        )}
      </ModalWrapper>
    </Modal>
  );
};

export default TourModal;
