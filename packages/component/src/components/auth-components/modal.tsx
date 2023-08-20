import { Modal, ModalCloseButton, ModalWrapper } from '@affine/component';
import type { FC, PropsWithChildren } from 'react';
import { useCallback } from 'react';

export type AuthModalProps = {
  open: boolean;
  setOpen: (value: boolean) => void;
};

export const AuthModal: FC<PropsWithChildren<AuthModalProps>> = ({
  children,
  open,
  setOpen,
}) => {
  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      wrapperPosition={['center', 'center']}
      data-testid="auth-modal"
    >
      <ModalWrapper
        width={1080}
        height={760}
        style={{
          height: '468px',
          width: '400px',
          overflow: 'hidden',
          backgroundColor: 'var(--affine-white)',
          boxShadow: 'var(--affine-popover-shadow)',
          padding: '44px 40px 0',
        }}
      >
        <ModalCloseButton top={20} right={20} onClick={handleClose} />
        {children}
      </ModalWrapper>
    </Modal>
  );
};
