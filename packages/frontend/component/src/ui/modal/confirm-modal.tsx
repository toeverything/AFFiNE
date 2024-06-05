import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { DialogTrigger } from '@radix-ui/react-dialog';
import clsx from 'clsx';
import type { PropsWithChildren, ReactNode } from 'react';
import { createContext, useCallback, useContext, useState } from 'react';

import type { ButtonProps } from '../button';
import { Button } from '../button';
import Input from '../input';
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
  const onConfirmClick = useCallback(() => {
    Promise.resolve(onConfirm?.()).catch(err => {
      console.error(err);
    });
  }, [onConfirm]);
  return (
    <Modal
      contentOptions={{
        className: styles.confirmModalContainer,
        onPointerDownOutside: e => {
          e.stopPropagation();
          onCancel?.();
        },
      }}
      width={width}
      closeButtonOptions={{
        onClick: onCancel,
      }}
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
        <Button onClick={onConfirmClick} {...confirmButtonOptions}></Button>
      </div>
    </Modal>
  );
};

interface OpenConfirmModalOptions {
  autoClose?: boolean;
  onSuccess?: () => void;
}
interface ConfirmModalContextProps {
  modalProps: ConfirmModalProps;
  openConfirmModal: (
    props?: ConfirmModalProps,
    options?: OpenConfirmModalOptions
  ) => void;
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
    (props?: ConfirmModalProps, options?: OpenConfirmModalOptions) => {
      const { autoClose = true, onSuccess } = options ?? {};
      if (!props) {
        setModalProps({ open: true });
        return;
      }

      const { onConfirm: _onConfirm, ...otherProps } = props;

      const onConfirm = () => {
        setLoading(true);
        return Promise.resolve(_onConfirm?.())
          .then(() => onSuccess?.())
          .catch(console.error)
          .finally(() => setLoading(false))
          .finally(() => autoClose && closeConfirmModal());
      };
      setModalProps({ ...otherProps, onConfirm, open: true });
    },
    [closeConfirmModal, setLoading]
  );

  const onOpenChange = useCallback(
    (open: boolean) => {
      modalProps.onOpenChange?.(open);
      setModalProps(props => ({ ...props, open }));
    },
    [modalProps]
  );

  return (
    <ConfirmModalContext.Provider
      value={{ openConfirmModal, closeConfirmModal, modalProps }}
    >
      {children}
      {/* TODO: multi-instance support(unnecessary for now) */}
      <ConfirmModal {...modalProps} onOpenChange={onOpenChange} />
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

export const usePromptModal = () => {
  const { closeConfirmModal, openConfirmModal } = useConfirmModal();
  const t = useAFFiNEI18N();
  return useCallback(
    (props: {
      confirmText?: string;
      cancelText?: string;
      placeholder?: string;
      message: ReactNode;
      title: ReactNode;
      abort?: AbortSignal;
    }) => {
      return new Promise<string | null>(resolve => {
        let value = '';
        const message = (
          <div className={styles.promptModalContent}>
            {props.message}
            <Input
              placeholder={props.placeholder}
              onChange={e => (value = e)}
            />
          </div>
        );
        openConfirmModal({
          ...props,
          confirmButtonOptions: {
            children: props.confirmText ?? t['Confirm'](),
            type: 'primary',
          },
          cancelButtonOptions: {
            children: props.cancelText ?? t['Cancel'](),
          },
          description: message,
          onConfirm: () => {
            resolve(value);
          },
          onCancel: () => {
            resolve(null);
          },
        });
        props.abort?.addEventListener('abort', () => {
          resolve(null);
          closeConfirmModal();
        });
      });
    },
    [closeConfirmModal, openConfirmModal, t]
  );
};
