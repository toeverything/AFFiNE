import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { DialogTrigger } from '@radix-ui/react-dialog';
import { Button } from '@toeverything/components/button';
import {
  ConfirmModal,
  type ConfirmModalProps,
  Modal,
} from '@toeverything/components/modal';
import { type ReactNode, useEffect, useRef } from 'react';

import * as styles from './style.css';

/**
 *
 * @param param0
 * @returns
 */
export const ConfirmLoadingModal = ({
  type,
  loading,
  open,
  content,
  onOpenChange,
  onConfirm,
  ...props
}: {
  type: 'resume' | 'change';
  loading?: boolean;
  content?: ReactNode;
} & ConfirmModalProps) => {
  const t = useAFFiNEI18N();
  const confirmed = useRef(false);

  const title = t[`com.affine.payment.modal.${type}.title`]();
  const confirmText = t[`com.affine.payment.modal.${type}.confirm`]();
  const cancelText = t[`com.affine.payment.modal.${type}.cancel`]();
  const contentText =
    type !== 'change' ? t[`com.affine.payment.modal.${type}.content`]() : '';

  useEffect(() => {
    if (!loading && open && confirmed.current) {
      onOpenChange?.(false);
      confirmed.current = false;
    }
  }, [loading, open, onOpenChange]);

  return (
    <ConfirmModal
      title={title}
      cancelText={cancelText}
      confirmButtonOptions={{
        type: 'primary',
        children: confirmText,
        loading,
      }}
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={() => {
        confirmed.current = true;
        onConfirm?.();
      }}
      {...props}
    >
      {content ?? contentText}
    </ConfirmModal>
  );
};

/**
 * Downgrade modal, confirm & cancel button are reversed
 * @param param0
 */
export const DowngradeModal = ({
  open,
  loading,
  onOpenChange,
  onCancel,
}: {
  loading?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCancel?: () => void;
}) => {
  const t = useAFFiNEI18N();
  const canceled = useRef(false);

  useEffect(() => {
    if (!loading && open && canceled.current) {
      onOpenChange?.(false);
      canceled.current = false;
    }
  }, [loading, open, onOpenChange]);

  return (
    <Modal
      title={t['com.affine.payment.modal.downgrade.title']()}
      open={open}
      contentOptions={{}}
      width={480}
      onOpenChange={onOpenChange}
    >
      <div className={styles.downgradeContentWrapper}>
        <p className={styles.downgradeContent}>
          {t['com.affine.payment.modal.downgrade.content']()}
        </p>
        <p className={styles.downgradeCaption}>
          {t['com.affine.payment.modal.downgrade.caption']()}
        </p>
      </div>

      <footer className={styles.downgradeFooter}>
        <Button
          onClick={() => {
            canceled.current = true;
            onCancel?.();
          }}
          loading={loading}
        >
          {t['com.affine.payment.modal.downgrade.cancel']()}
        </Button>
        <DialogTrigger asChild>
          <Button
            disabled={loading}
            onClick={() => onOpenChange?.(false)}
            type="primary"
          >
            {t['com.affine.payment.modal.downgrade.confirm']()}
          </Button>
        </DialogTrigger>
      </footer>
    </Modal>
  );
};
