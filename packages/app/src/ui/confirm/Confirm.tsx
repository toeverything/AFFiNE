import { useState } from 'react';
import { Modal, ModalCloseButton, ModalProps } from '../modal';
import {
  StyledButtonWrapper,
  StyledConfirmContent,
  StyledConfirmTitle,
  StyledModalWrapper,
} from '@/ui/confirm/styles';
import { Button } from '@/ui/button';
import { useTranslation } from 'react-i18next';
export type ConfirmProps = {
  title?: string;
  content?: string;
  confirmText?: string;
  cancelText?: string;
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
  cancelText = 'Cancel',
}: ConfirmProps) => {
  const [open, setOpen] = useState(true);
  const { t } = useTranslation();
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
          <Button
            shape="round"
            bold={true}
            onClick={() => {
              setOpen(false);
              onCancel?.();
            }}
            style={{ marginRight: '24px' }}
          >
            {cancelText}
          </Button>
          <Button
            type={confirmType}
            shape="round"
            bold={true}
            onClick={() => {
              setOpen(false);
              onConfirm?.();
            }}
          >
            {confirmText}
          </Button>
        </StyledButtonWrapper>
      </StyledModalWrapper>
    </Modal>
  );
};

export default Confirm;
