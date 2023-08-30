import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { useCallback, useMemo } from 'react';

import type { ModalProps } from '../modal';
import { Modal, ModalCloseButton } from '../modal';
import {
  StyledColumnButtonWrapper,
  StyledConfirmContent,
  StyledConfirmTitle,
  StyledModalWrapper,
  StyledRowButtonWrapper,
} from './styles';

export type ConfirmProps = {
  title?: string;
  content?: string;
  confirmText?: string;
  cancelText?: string;
  // TODO: Confirm button's color should depend on confirm type
  confirmType?: 'primary' | 'warning' | 'error';
  buttonDirection?: 'row' | 'column';
  onConfirm?: () => void;
  onCancel?: () => void;
  cancelButtonTestId?: string;
  confirmButtonTestId?: string;
} & Omit<ModalProps, 'children'>;

export const Confirm = ({
  title,
  content,
  confirmText,
  confirmType,
  onConfirm,
  onCancel,
  buttonDirection = 'row',
  cancelText = 'Cancel',
  open,
  cancelButtonTestId = '',
  confirmButtonTestId = '',
}: ConfirmProps) => {
  const t = useAFFiNEI18N();
  const cancelText_ = useMemo<string>(() => {
    return cancelText === 'Cancel' ? t['Cancel']() : cancelText;
  }, [cancelText, t]);

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);
  const handleConfirm = useCallback(() => {
    onConfirm?.();
  }, [onConfirm]);

  return (
    <Modal open={open} disablePortal={false}>
      <StyledModalWrapper>
        <ModalCloseButton onClick={handleCancel} />
        <StyledConfirmTitle>{title}</StyledConfirmTitle>
        <StyledConfirmContent>{content}</StyledConfirmContent>
        {buttonDirection === 'row' ? (
          <StyledRowButtonWrapper>
            <Button
              onClick={handleCancel}
              size="large"
              style={{ marginRight: '24px' }}
              data-testid={cancelButtonTestId}
            >
              {cancelText_}
            </Button>
            <Button
              type={confirmType}
              onClick={handleConfirm}
              size="large"
              data-testid={confirmButtonTestId}
            >
              {confirmText}
            </Button>
          </StyledRowButtonWrapper>
        ) : (
          <StyledColumnButtonWrapper>
            <Button
              type={confirmType}
              onClick={handleConfirm}
              style={{ width: '284px', height: '38px', textAlign: 'center' }}
              data-testid={confirmButtonTestId}
            >
              {confirmText}
            </Button>
            <Button
              onClick={handleCancel}
              style={{
                marginTop: '16px',
                width: '284px',
                height: '38px',
                textAlign: 'center',
              }}
              data-testid={cancelButtonTestId}
            >
              {cancelText_}
            </Button>
          </StyledColumnButtonWrapper>
        )}
      </StyledModalWrapper>
    </Modal>
  );
};

export default Confirm;
