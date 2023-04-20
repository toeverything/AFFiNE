import { IconButton, Modal, ModalWrapper } from '@affine/component';
import { CloseIcon } from '@blocksuite/icons';
import type React from 'react';

import { Content, ContentTitle, Header, StyleButton, StyleTips } from './style';

interface TmpDisableAffineCloudModalProps {
  open: boolean;
  onClose: () => void;
}

export const TmpDisableAffineCloudModal: React.FC<
  TmpDisableAffineCloudModalProps
> = ({ open, onClose }) => {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalWrapper width={560} height={292}>
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
            time it&apos;s available, please <a href="#">click here</a>
          </StyleTips>
          <div>
            <StyleButton
              shape="round"
              type="primary"
              onClick={() => {
                onClose();
              }}
            >
              Got it
            </StyleButton>
          </div>
        </Content>
      </ModalWrapper>
    </Modal>
  );
};
