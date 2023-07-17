import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowLeftSmallIcon, ArrowRightSmallIcon } from '@blocksuite/icons';
import clsx from 'clsx';
import type { FC } from 'react';
import { useState } from 'react';

import { Modal, ModalCloseButton, ModalWrapper } from '../..';
import {
  arrowStyle,
  buttonDisableStyle,
  containerStyle,
  descriptionContainerStyle,
  descriptionStyle,
  formSlideToLeftStyle,
  formSlideToRightStyle,
  modalStyle,
  slideToLeftStyle,
  slideToRightStyle,
  tabActiveStyle,
  tabContainerStyle,
  tabStyle,
  titleContainerStyle,
  titleStyle,
  videoContainerStyle,
  videoSlideStyle,
  videoStyle,
} from './index.css';

type TourModalProps = {
  open: boolean;
  onClose: () => void;
};

export const TourModal: FC<TourModalProps> = ({ open, onClose }) => {
  const t = useAFFiNEI18N();
  const [step, setStep] = useState(-1);
  const handleClose = () => {
    setStep(-1);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={handleClose}
      wrapperPosition={['center', 'center']}
      hideBackdrop
    >
      <ModalWrapper
        width={545}
        style={{ minHeight: '480px' }}
        data-testid="onboarding-modal"
      >
        <ModalCloseButton
          top={6}
          right={10}
          onClick={handleClose}
          data-testid="onboarding-modal-close-button"
        />
        <div className={modalStyle}>
          <div className={titleContainerStyle}>
            {step !== -1 && (
              <div
                className={clsx(titleStyle, {
                  [slideToRightStyle]: step === 0,
                  [formSlideToLeftStyle]: step === 1,
                })}
              >
                {t['com.affine.onboarding.title2']()}
              </div>
            )}
            <div
              className={clsx(titleStyle, {
                [slideToLeftStyle]: step === 1,
                [formSlideToRightStyle]: step === 0,
              })}
            >
              {t['com.affine.onboarding.title1']()}
            </div>
          </div>

          <div className={containerStyle}>
            <div
              className={clsx(arrowStyle, { [buttonDisableStyle]: step !== 1 })}
              onClick={() => step === 1 && setStep(0)}
              data-testid="onboarding-modal-pre-button"
            >
              <ArrowLeftSmallIcon />
            </div>
            <div className={videoContainerStyle}>
              <div className={videoSlideStyle}>
                {step !== -1 && (
                  <video
                    autoPlay
                    muted
                    loop
                    className={clsx(videoStyle, {
                      [slideToRightStyle]: step === 0,
                      [formSlideToLeftStyle]: step === 1,
                    })}
                    data-testid="onboarding-modal-editing-video"
                  >
                    <source src="/editingVideo.mp4" type="video/mp4" />
                    <source src="/editingVideo.webm" type="video/webm" />
                  </video>
                )}
                <video
                  autoPlay
                  muted
                  loop
                  className={clsx(videoStyle, {
                    [slideToLeftStyle]: step === 1,
                    [formSlideToRightStyle]: step === 0,
                  })}
                  data-testid="onboarding-modal-switch-video"
                >
                  <source src="/switchVideo.mp4" type="video/mp4" />
                  <source src="/switchVideo.webm" type="video/webm" />
                </video>
              </div>
            </div>
            <div
              className={clsx(arrowStyle, { [buttonDisableStyle]: step === 1 })}
              onClick={() => setStep(1)}
              data-testid="onboarding-modal-next-button"
            >
              <ArrowRightSmallIcon />
            </div>
          </div>
          <ul className={tabContainerStyle}>
            <li
              className={clsx(tabStyle, {
                [tabActiveStyle]: step !== 1,
              })}
              onClick={() => setStep(0)}
            ></li>
            <li
              className={clsx(tabStyle, { [tabActiveStyle]: step === 1 })}
              onClick={() => setStep(1)}
            ></li>
          </ul>
          <div className={descriptionContainerStyle}>
            {step !== -1 && (
              <div
                className={clsx(descriptionStyle, {
                  [slideToRightStyle]: step === 0,
                  [formSlideToLeftStyle]: step === 1,
                })}
              >
                {t['com.affine.onboarding.videoDescription2']()}
              </div>
            )}
            <div
              className={clsx(descriptionStyle, {
                [slideToLeftStyle]: step === 1,
                [formSlideToRightStyle]: step === 0,
              })}
            >
              {t['com.affine.onboarding.videoDescription1']()}
            </div>
          </div>
        </div>
      </ModalWrapper>
    </Modal>
  );
};

export default TourModal;
