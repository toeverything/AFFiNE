import type { FC, PropsWithChildren } from 'react';

import { Modal } from '../../ui/modal';

export type AuthModalProps = {
  open: boolean;
  setOpen: (value: boolean) => void;
};

export const AuthModal: FC<PropsWithChildren<AuthModalProps>> = ({
  children,
  open,
  setOpen,
}) => {
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      width={400}
      minHeight={500}
      contentOptions={{
        ['data-testid' as string]: 'auth-modal',
        style: { padding: '44px 40px 0' },
      }}
    >
      {children}
    </Modal>
  );
};
