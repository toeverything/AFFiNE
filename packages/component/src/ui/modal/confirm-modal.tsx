import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button, type ButtonType } from '@toeverything/components/button';
import { useCallback } from 'react';

import { Modal, type ModalProps } from './modal';
import { ModalCloseButton } from './modal-close-button';
import { ModalWrapper } from './modal-wrapper';
import {
  StyledModalContent,
  StyledModalFooter,
  StyledModalTitle,
} from './styles';

export interface BaseModalProps
  extends Omit<ModalProps, 'onClose' | 'children'> {
  title?: string;
  content?: string;
  confirmText?: string;
  confirmType?: ButtonType;
  onClose: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmModal = ({
  open,
  onClose,
  confirmText,
  confirmType = 'primary',
  onCancel,
  onConfirm,
  title,
  content,
}: BaseModalProps) => {
  const t = useAFFiNEI18N();

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      wrapperPosition={['center', 'center']}
      data-testid="auth-modal"
    >
      <ModalWrapper
        width={480}
        minHeight={194}
        style={{
          overflow: 'hidden',
          backgroundColor: 'var(--affine-white)',
          boxShadow: 'var(--affine-popover-shadow)',
          padding: '20px 24px 0',
        }}
      >
        <ModalCloseButton top={22} right={20} onClick={handleClose} />
        <StyledModalTitle>{title}</StyledModalTitle>
        <StyledModalContent>{content}</StyledModalContent>
        <StyledModalFooter>
          <Button onClick={onCancel} style={{ marginRight: 20 }}>
            {t['Cancel']()}
          </Button>
          <Button type={confirmType} onClick={onConfirm}>
            {confirmText || t['Confirm']()}
          </Button>
        </StyledModalFooter>
      </ModalWrapper>
    </Modal>
  );
};
