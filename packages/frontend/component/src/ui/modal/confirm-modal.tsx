import { DialogTrigger } from '@radix-ui/react-dialog';
import clsx from 'clsx';
import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useState } from 'react';

import type { ButtonProps } from '../button';
import { Button } from '../button';
import { desktopStyles, mobileStyles } from './confirm-modal.css';
import type { ModalProps } from './modal';
import { Modal } from './modal';

const styles = BUILD_CONFIG.isMobileEdition ? mobileStyles : desktopStyles;

export interface ConfirmModalProps extends ModalProps {
  customConfirmButton?: () => React.ReactNode;
  confirmButtonOptions?: Omit<ButtonProps, 'children'>;
  childrenContentClassName?: string;
  onConfirm?: (() => void) | (() => Promise<void>);
  onCancel?: (() => void) | false;
  confirmText?: React.ReactNode;
  cancelText?: React.ReactNode;
  cancelButtonOptions?: Omit<ButtonProps, 'children'>;
  reverseFooter?: boolean;
  /**
   * Whether to use row layout for mobile footer
   * @default false
   */
  rowFooter?: boolean;
  /**
   * Auto focus on confirm button when modal opened
   * @default true
   */
  autoFocusConfirm?: boolean;
}

export const ConfirmModal = ({
  children,
  confirmButtonOptions,
  customConfirmButton: CustomConfirmButton,
  // FIXME: we need i18n
  confirmText,
  cancelText = 'Cancel',
  cancelButtonOptions,
  reverseFooter,
  onConfirm,
  onCancel,
  width = 480,
  autoFocusConfirm = true,
  headerClassName,
  descriptionClassName,
  childrenContentClassName,
  contentOptions,
  rowFooter = false,
  ...props
}: ConfirmModalProps) => {
  const onConfirmClick = useCallback(() => {
    Promise.resolve(onConfirm?.()).catch(err => {
      console.error(err);
    });
  }, [onConfirm]);
  const handleCancel = useCallback(() => {
    if (onCancel === false) {
      return;
    }
    onCancel?.();
  }, [onCancel]);
  return (
    <Modal
      contentOptions={{
        ...contentOptions,
        className: clsx(styles.container, contentOptions?.className),
        onPointerDownOutside: e => {
          e.stopPropagation();
          handleCancel();
        },
      }}
      width={width}
      closeButtonOptions={{
        onClick: handleCancel,
      }}
      headerClassName={clsx(styles.header, headerClassName)}
      descriptionClassName={clsx(styles.description, descriptionClassName)}
      {...props}
    >
      {children ? (
        <div className={clsx(styles.content, childrenContentClassName)}>
          {children}
        </div>
      ) : null}
      <div
        className={clsx(styles.footer, {
          modalFooterWithChildren: !!children,
          reverse: reverseFooter && !rowFooter,
          row: rowFooter,
          rowReverse: reverseFooter && rowFooter,
        })}
      >
        {onCancel !== false ? (
          <DialogTrigger asChild>
            <Button
              className={clsx(styles.action, {
                row: rowFooter,
              })}
              onClick={handleCancel}
              data-testid="confirm-modal-cancel"
              {...cancelButtonOptions}
              variant={
                cancelButtonOptions?.variant
                  ? cancelButtonOptions.variant
                  : 'secondary'
              }
            >
              {cancelText}
            </Button>
          </DialogTrigger>
        ) : null}
        {CustomConfirmButton ? (
          <CustomConfirmButton data-testid="confirm-modal-confirm" />
        ) : (
          <Button
            className={clsx(styles.action, {
              row: rowFooter,
            })}
            onClick={onConfirmClick}
            data-testid="confirm-modal-confirm"
            autoFocus={autoFocusConfirm}
            {...confirmButtonOptions}
          >
            {confirmText}
          </Button>
        )}
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
      {/* TODO(@catsjuice): multi-instance support(unnecessary for now) */}
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
