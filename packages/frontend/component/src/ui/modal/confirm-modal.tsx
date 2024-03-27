import { DialogTrigger } from '@radix-ui/react-dialog';
import clsx from 'clsx';
import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useState } from 'react';

import type { ButtonProps } from '../button';
import { Button } from '../button';
import type { ModalProps } from './modal';
import { Modal } from './modal';
import * as styles from './styles.css';

export interface ConfirmModalProps extends ModalProps {
  confirmButtonOptions?: ButtonProps;
  onConfirm?: (() => void) | (() => Promise<void>);
  onCancel?: () => void;
  cancelText?: string;
  cancelButtonOptions?: ButtonProps;
  reverseFooter?: boolean;
}

export const ConfirmModal = ({
  children,
  confirmButtonOptions,
  // FIXME: we need i18n
  cancelText = 'Cancel',
  cancelButtonOptions,
  reverseFooter,
  onConfirm,
  onCancel,
  width = 480,
  ...props
}: ConfirmModalProps) => {
  return (
    <Modal
      contentOptions={{ className: styles.confirmModalContainer }}
      width={width}
      {...props}
    >
      {children ? (
        <div className={styles.confirmModalContent}>{children}</div>
      ) : null}
      <div
        className={clsx(styles.modalFooter, {
          modalFooterWithChildren: !!children,
          reverse: reverseFooter,
        })}
      >
        <DialogTrigger asChild>
          <Button onClick={onCancel} {...cancelButtonOptions}>
            {cancelText}
          </Button>
        </DialogTrigger>
        <Button onClick={onConfirm} {...confirmButtonOptions}></Button>
      </div>
    </Modal>
  );
};

interface ConfirmModalContextProps {
  modalProps: ConfirmModalProps;
  openConfirmModal: (props?: ConfirmModalProps) => void;
  closeConfirmModal: () => void;
}
const ConfirmModalContext = createContext<ConfirmModalContextProps>({
  modalProps: { open: false },
  openConfirmModal: () => {},
  closeConfirmModal: () => {},
});
export const ConfirmModalProvider = ({ children }: PropsWithChildren) => {
  const [modalProps, setModalProps] = useState<ConfirmModalProps>({
    open: false,
  });

  const setLoading = useCallback((value: boolean) => {
    setModalProps(prev => ({
      ...prev,
      confirmButtonOptions: {
        ...prev.confirmButtonOptions,
        loading: value,
      },
    }));
  }, []);

  const closeConfirmModal = useCallback(() => {
    setModalProps({ open: false });
  }, []);

  const openConfirmModal = useCallback(
    (props?: ConfirmModalProps) => {
      if (!props) {
        setModalProps({ open: true });
        return;
      }

      const { onConfirm: _onConfirm, ...otherProps } = props;

      const onConfirm = () => {
        setLoading(true);
        _onConfirm?.()
          ?.catch(console.error)
          ?.finally(() => closeConfirmModal());
      };
      setModalProps({ ...otherProps, onConfirm, open: true });
    },
    [closeConfirmModal, setLoading]
  );

  const onOpenChange = useCallback((open: boolean) => {
    setModalProps(props => ({ ...props, open }));
  }, []);

  return (
    <ConfirmModalContext.Provider
      value={{ openConfirmModal, closeConfirmModal, modalProps }}
    >
      {children}
      {/* TODO: multi-instance support(unnecessary for now) */}
      <ConfirmModal onOpenChange={onOpenChange} {...modalProps} />
    </ConfirmModalContext.Provider>
  );
};
export const useConfirmModal = () => {
  const context = useContext(ConfirmModalContext);
  if (!context) {
    throw new Error(
      'useConfirmModal must be used within a ConfirmModalProvider'
    );
  }
  return {
    openConfirmModal: context.openConfirmModal,
    closeConfirmModal: context.closeConfirmModal,
  };
};
