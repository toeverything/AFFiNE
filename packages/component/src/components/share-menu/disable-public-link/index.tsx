import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  ConfirmModal,
  type ConfirmModalProps,
} from '@toeverything/components/modal';

export const PublicLinkDisableModal = (props: ConfirmModalProps) => {
  const t = useAFFiNEI18N();

  return (
    <ConfirmModal
      title={t['com.affine.publicLinkDisableModal.title']()}
      description={t['com.affine.publicLinkDisableModal.description']()}
      cancelText={t['com.affine.publicLinkDisableModal.button.cancel']()}
      confirmButtonOptions={{
        type: 'error',
        ['data-testid' as string]: 'confirm-enable-affine-cloud-button',
        children: t['com.affine.publicLinkDisableModal.button.disable'](),
      }}
      {...props}
    />
  );
};
