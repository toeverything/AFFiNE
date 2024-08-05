import { Button } from '@affine/component/ui/button';
import type { ConfirmModalProps } from '@affine/component/ui/modal';
import { ConfirmModal, Modal } from '@affine/component/ui/modal';
import { useI18n } from '@affine/i18n';
import { DialogTrigger } from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

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
  const t = useI18n();
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
      confirmText={confirmText}
      confirmButtonOptions={{
        variant: 'primary',
        loading,
      }}
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={() => {
        confirmed.current = true;
        onConfirm?.()?.catch(console.error);
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
  const t = useI18n();
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
            variant="primary"
          >
            {t['com.affine.payment.modal.downgrade.confirm']()}
          </Button>
        </DialogTrigger>
      </footer>
    </Modal>
  );
};
