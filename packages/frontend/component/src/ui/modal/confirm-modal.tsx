import { DialogTrigger } from '@radix-ui/react-dialog';
import clsx from 'clsx';

import type { ButtonProps } from '../button';
import { Button } from '../button';
import { Modal, type ModalProps } from './modal';
import * as styles from './styles.css';

export interface ConfirmModalProps extends ModalProps {
  confirmButtonOptions?: ButtonProps;
  onConfirm?: () => void;
  cancelText?: string;
  cancelButtonOptions?: ButtonProps;
}

export const ConfirmModal = ({
  children,
  confirmButtonOptions,
  // FIXME: we need i18n
  cancelText = 'Cancel',
  cancelButtonOptions,
  onConfirm,
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
        })}
      >
        <DialogTrigger asChild>
          <Button {...cancelButtonOptions}>{cancelText}</Button>
        </DialogTrigger>
        <Button onClick={onConfirm} {...confirmButtonOptions}></Button>
      </div>
    </Modal>
  );
};
