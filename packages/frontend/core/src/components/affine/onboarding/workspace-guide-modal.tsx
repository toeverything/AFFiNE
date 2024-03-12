import { OverlayModal } from '@affine/component';
import type { ModalProps } from '@affine/component/ui/modal';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { memo, useCallback, useEffect, useState } from 'react';

import { useAppConfigStorage } from '../../../hooks/use-app-config-storage';
import Thumb from './assets/thumb';

const overlayOptions: ModalProps['overlayOptions'] = {
  style: {
    background:
      'linear-gradient(95deg, transparent 0px, var(--affine-background-primary-color) 400px)',
  },
};

export const WorkspaceGuideModal = memo(function WorkspaceGuideModal() {
  const t = useAFFiNEI18N();
  const [dismiss, setDismiss] = useAppConfigStorage(
    'dismissWorkspaceGuideModal'
  );
  const [open, setOpen] = useState(!dismiss);

  // blur modal background, can't use css: `backdrop-filter: blur()`,
  // because it won't behave as expected on client side (texts over transparent window are not blurred)
  useEffect(() => {
    const appDom = document.querySelector('#app') as HTMLElement;
    if (!appDom) return;
    appDom.style.filter = open ? 'blur(7px)' : 'none';

    return () => {
      appDom.style.filter = 'none';
    };
  }, [open]);

  const gotIt = useCallback(() => {
    setDismiss(true);
  }, [setDismiss]);

  const onOpenChange = useCallback((v: boolean) => {
    setOpen(v);
    // should set dismiss here ?
    // setDismiss(true)
  }, []);

  return (
    <OverlayModal
      open={open}
      onOpenChange={onOpenChange}
      topImage={<Thumb />}
      title={t['com.affine.onboarding.workspace-guide.title']()}
      description={t['com.affine.onboarding.workspace-guide.content']()}
      onConfirm={gotIt}
      overlayOptions={overlayOptions}
      withoutCancelButton
      confirmButtonOptions={{
        style: {
          fontWeight: 500,
        },
        type: 'primary',
        size: 'large',
      }}
      confirmText={t['com.affine.onboarding.workspace-guide.got-it']()}
    />
  );
});
