import { Modal, ModalCloseButton, ModalWrapper } from '@affine/component';
import type { PropsWithChildren } from 'react';
import { useCallback } from 'react';

export interface SettingModalProps {
  open: boolean;
  setOpen: (value: boolean) => void;
}

export const SettingModal = ({
  children,
  open,
  setOpen,
}: PropsWithChildren<SettingModalProps>) => {
  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      wrapperPosition={['center', 'center']}
      data-testid="setting-modal"
    >
      <ModalWrapper
        width={1080}
        height={760}
        style={{
          maxHeight: '85vh',
          maxWidth: '70vw',
          overflow: 'hidden',
          display: 'flex',
          backgroundColor: 'var(--affine-background-overlay-panel-color)',
          boxShadow: 'var(--affine-popover-shadow)',
        }}
      >
        <ModalCloseButton top={16} right={20} onClick={handleClose} />
        {children}
      </ModalWrapper>
    </Modal>
  );
};
