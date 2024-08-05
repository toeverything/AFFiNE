import { useI18n } from '@affine/i18n';

import type { ConfirmModalProps } from '../../ui/modal';
import { ConfirmModal } from '../../ui/modal';

export const PublicLinkDisableModal = (props: ConfirmModalProps) => {
  const t = useI18n();

  return (
    <ConfirmModal
      title={t['com.affine.publicLinkDisableModal.title']()}
      description={t['com.affine.publicLinkDisableModal.description']()}
      cancelText={t['com.affine.publicLinkDisableModal.button.cancel']()}
      confirmText={t['com.affine.publicLinkDisableModal.button.disable']()}
      confirmButtonOptions={{
        variant: 'error',
        ['data-testid' as string]: 'confirm-enable-affine-cloud-button',
      }}
      {...props}
    />
  );
};
