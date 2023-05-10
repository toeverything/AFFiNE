import { ArrowLeftSmallIcon, ArrowRightSmallIcon } from '@blocksuite/icons';
import clsx from 'clsx';
import type { FC } from 'react';
import { useState } from 'react';

import { Modal, ModalCloseButton, ModalWrapper } from '../..';
import {
  arrowStyle,
  containerStyle,
  descriptionStyle,
  modalStyle,
  tabActiveStyle,
  tabContainerStyle,
  tabStyle,
  titleStyle,
  videoActiveStyle,
  videoContainerStyle,
  videoSlideStyle,
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
      <ModalWrapper width={545} height={440} data-testid="onboarding-modal">
        <ModalCloseButton
          top={6}
          right={10}
          onClick={handleClose}
          data-testid="onboarding-modal-close-button"
        />
        <div className={modalStyle}>
          <div className={titleStyle}>
            {step === 1
              ? 'Intuitive & robust block-based editing'
              : 'Hyper merged whiteboard and docs'}
          </div>
          <div className={containerStyle}>
            <div className={arrowStyle} onClick={() => setStep(0)}>
              <ArrowLeftSmallIcon />
            </div>
            <div className={videoContainerStyle}>
              <div className={videoSlideStyle}>
                <video
                  autoPlay
                  muted
                  loop
                  className={clsx(videoStyle, {
                    [videoActiveStyle]: step === 0,
                  })}
                  data-testid="onboarding-modal-editing-video"
                >
                  <source src="/editingVideo.mp4" type="video/mp4" />
                  <source src="/editingVideo.webm" type="video/webm" />
                </video>
                <video
                  autoPlay
                  muted
                  loop
                  className={clsx(videoStyle, {
                    [videoActiveStyle]: step === 1,
                  })}
                  data-testid="onboarding-modal-switch-video"
                >
                  <source src="/switchVideo.mp4" type="video/mp4" />
                  <source src="/switchVideo.webm" type="video/webm" />
                </video>
              </div>
            </div>
            <div className={arrowStyle} onClick={() => setStep(1)}>
              <ArrowRightSmallIcon />
            </div>
          </div>
          <ul className={tabContainerStyle}>
            <li
              className={clsx(tabStyle, { [tabActiveStyle]: step === 0 })}
              onClick={() => setStep(0)}
            ></li>
            <li
              className={clsx(tabStyle, { [tabActiveStyle]: step === 1 })}
              onClick={() => setStep(1)}
            ></li>
          </ul>
          <div className={descriptionStyle}>
            {step === 1
              ? ' Create structured documents with ease, using a modular interface to drag and drop blocks of text, images, and other content.'
              : 'Easily switch between Page mode for structured document creation and Whiteboard mode for the freeform visual expression of creative ideas.'}
          </div>
        </div>
      </ModalWrapper>
    </Modal>
  );
};

export default TourModal;
