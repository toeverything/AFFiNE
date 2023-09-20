import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useReducer } from 'react';

import * as styles from './modal.css';

// a CMDK modal that can be used to display a CMDK command
// it has a smooth animation and can be closed by clicking outside of the modal

export interface CMDKModalProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}

type ModalAnimationState = 'entering' | 'entered' | 'exiting' | 'exited';

function reduceAnimationState(
  state: ModalAnimationState,
  action: 'open' | 'close' | 'finish'
) {
  switch (action) {
    case 'open':
      return state === 'entered' || state === 'entering' ? state : 'entering';
    case 'close':
      return state === 'exited' || state === 'exiting' ? state : 'exiting';
    case 'finish':
      return state === 'entering' ? 'entered' : 'exited';
  }
}

export const CMDKModal = ({
  onOpenChange,
  open,
  children,
}: React.PropsWithChildren<CMDKModalProps>) => {
  const [animationState, dispatch] = useReducer(reduceAnimationState, 'exited');

  useEffect(() => {
    dispatch(open ? 'open' : 'close');
    const timeout = setTimeout(() => {
      dispatch('finish');
    }, 120);

    return () => {
      clearTimeout(timeout);
    };
  }, [open]);

  return (
    <Dialog.Root
      modal
      open={animationState !== 'exited'}
      onOpenChange={onOpenChange}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.modalOverlay} />
        <div className={styles.modalContentWrapper}>
          <Dialog.Content
            className={styles.modalContent}
            data-state={animationState}
          >
            {children}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
