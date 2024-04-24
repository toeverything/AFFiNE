import { DialogTrigger } from '@radix-ui/react-dialog';
import clsx from 'clsx';
import { useCallback } from 'react';

import { Button } from '../button';
import type { ConfirmModalProps } from '../modal';
import * as styles from './confirm-dialog.css';

export const ConfirmModalInner = ({
  children,
  confirmButtonOptions,
  // FIXME: we need i18n
  cancelText = 'Cancel',
  cancelButtonOptions,
  reverseFooter,
  onConfirm,
  onCancel,
}: ConfirmModalProps) => {
  const onConfirmClick = useCallback(() => {
    Promise.resolve(onConfirm?.()).catch(err => {
      console.error(err);
    });
  }, [onConfirm]);

  return (
    <>
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
    </>
  );
};
