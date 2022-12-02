import { useState } from 'react';
import { Modal, ModalCloseButton, ModalProps } from '../modal';
import {
  StyledButtonWrapper,
  StyledConfirmContent,
  StyledConfirmTitle,
  StyledModalWrapper,
  StyledButton,
} from '@/ui/confirm/styles';

export type ConfirmProps = {
  title?: string;
  content?: string;
  confirmText?: string;
  // TODO: Confirm button's color should depend on confirm type
  confirmType?: 'primary' | 'warning' | 'danger';
  onConfirm?: () => void;
  onCancel?: () => void;
} & Omit<ModalProps, 'open' | 'children'>;

export const Confirm = ({
  title,
  content,
  confirmText,
  confirmType,
  onConfirm,
  onCancel,
}: ConfirmProps) => {
  const [open, setOpen] = useState(true);
  return (
    <Modal open={open}>
      <StyledModalWrapper>
        <ModalCloseButton
          onClick={() => {
            setOpen(false);
            onCancel?.();
          }}
        />
        <StyledConfirmTitle>{title}</StyledConfirmTitle>
        <StyledConfirmContent>{content}</StyledConfirmContent>

        <StyledButtonWrapper>
          <StyledButton
            onClick={() => {
              setOpen(false);
              onCancel?.();
            }}
          >
            Cancel
          </StyledButton>
          <StyledButton
            confirmType={confirmType}
            onClick={() => {
              setOpen(false);
              onConfirm?.();
            }}
          >
            {confirmText}
          </StyledButton>
        </StyledButtonWrapper>
      </StyledModalWrapper>
    </Modal>
  );
};

export default Confirm;
