import * as Dialog from '@radix-ui/react-dialog';
import { useLayoutEffect, useRef, useState } from 'react';

import * as styles from './styles.css';

// a CMDK modal that can be used to display a CMDK command
// it has a smooth animation and can be closed by clicking outside of the modal

interface CMDKModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CMDKModal = ({
  onOpenChange,
  open,
  children,
}: React.PropsWithChildren<CMDKModalProps>) => {
  const firstRef = useRef(false);
  const [hiding, setHiding] = useState(false);
  const [show, setShow] = useState(false);

  useLayoutEffect(() => {
    if (!open && firstRef.current) {
      setHiding(true);
      setShow(true);
      const timeout = setTimeout(() => {
        setHiding(false);
        setShow(false);
      }, 120);

      return () => {
        clearTimeout(timeout);
      };
    }

    firstRef.current = true;

    if (open) {
      setShow(true);
      setHiding(false);
    }
    return;
  }, [open]);

  return (
    <Dialog.Root modal open={show} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.modalOverlay} />
        <Dialog.Content className={styles.modalContent} data-hiding={hiding}>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
