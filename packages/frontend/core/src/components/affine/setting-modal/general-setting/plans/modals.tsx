import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  ConfirmModal,
  type ConfirmModalProps,
} from '@toeverything/components/modal';
import { useEffect, useRef } from 'react';

/**
 *
 * @param param0
 * @returns
 */
export const ConfirmLoadingModal = ({
  type,
  loading,
  open,
  onOpenChange,
  onConfirm,
  ...props
}: {
  type: 'resume' | 'downgrade' | 'change' | 'upgrade';
  loading?: boolean;
} & ConfirmModalProps) => {
  const t = useAFFiNEI18N();
  const confirmed = useRef(false);

  const title = t[`com.affine.settings.plans.modal.${type}.title`]();
  const confirmText = t[`com.affine.settings.plans.modal.${type}.confirm`]();
  const content = t[`com.affine.settings.plans.modal.${type}.content`]();

  useEffect(() => {
    if (!loading && open && confirmed.current) {
      onOpenChange?.(false);
      confirmed.current = false;
    }
  }, [loading, open, onOpenChange]);

  return (
    <ConfirmModal
      title={title}
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
      {content}
    </ConfirmModal>
  );
};
