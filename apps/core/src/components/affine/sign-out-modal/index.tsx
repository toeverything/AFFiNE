import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  ConfirmModal,
  type ConfirmModalProps,
} from '@toeverything/components/modal';

export const SignOutModal = ({ ...props }: ConfirmModalProps) => {
  const t = useAFFiNEI18N();
  return (
    <ConfirmModal
      title={props.title ?? t['com.affine.auth.sign-out.confirm-modal.title']()}
      description={
        props.description ??
        t['com.affine.auth.sign-out.confirm-modal.description']()
      }
      cancelText={
        props.cancelText ?? t['com.affine.auth.sign-out.confirm-modal.cancel']()
      }
      confirmButtonOptions={{
        type: 'error',
        ['data-testid' as string]: 'confirm-sign-out-button',
        children:
          props.confirmButtonOptions?.children ??
          t['com.affine.auth.sign-out.confirm-modal.confirm'](),
      }}
      contentOptions={{
        ['data-testid' as string]: 'confirm-sign-out-modal',
      }}
      {...props}
    />
  );
};
