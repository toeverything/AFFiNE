import { Empty, IconButton, Modal, ModalWrapper } from '@affine/component';
import { CloseIcon } from '@blocksuite/icons';
import type React from 'react';

import {
  Content,
  ContentTitle,
  Header,
  StyleButton,
  StyleButtonContainer,
  StyleImage,
  StyleTips,
} from './style';

interface TmpDisableAffineCloudModalProps {
  open: boolean;
  onClose: () => void;
}

export const TmpDisableAffineCloudModal: React.FC<
  TmpDisableAffineCloudModalProps
> = ({ open, onClose }) => {
  return (
    <Modal
      data-testid="disable-affine-cloud-modal"
      open={open}
      onClose={onClose}
    >
      <ModalWrapper width={480}>
        <Header>
          <IconButton
            onClick={() => {
              onClose();
            }}
          >
            <CloseIcon />
          </IconButton>
        </Header>
        <Content>
          <ContentTitle>AFFiNE Cloud is upgrading now.</ContentTitle>
          <StyleTips>
            We are upgrading the AFFiNE Cloud service and it is temporarily
            unavailable on the client side. If you wish to be notified the first
            time it&apos;s available, please&nbsp;
            <a
              href="https://github.com/toeverything/AFFiNE/releases"
              target="_blank"
              style={{
                color: 'var(--affine-link-color)',
              }}
            >
              click here
            </a>
            .
          </StyleTips>
          <StyleImage>
            <Empty
              containerStyle={{
                width: '200px',
                height: '112px',
              }}
            />
          </StyleImage>
          <StyleButtonContainer>
            <StyleButton
              shape="round"
              type="primary"
              onClick={() => {
                onClose();
              }}
            >
              Got it
            </StyleButton>
          </StyleButtonContainer>
        </Content>
      </ModalWrapper>
    </Modal>
  );
};
