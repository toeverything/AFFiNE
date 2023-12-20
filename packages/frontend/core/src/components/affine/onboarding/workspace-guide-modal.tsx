import { Button, Modal, type ModalProps } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { memo, useCallback, useEffect, useState } from 'react';

import { useAppConfigStorage } from '../../../hooks/use-app-config-storage';
import Thumb from './assets/thumb';
import * as styles from './workspace-guide-modal.css';

const contentOptions: ModalProps['contentOptions'] = {
  style: { padding: 0, overflow: 'hidden' },
};
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
    setOpen(false);
    setDismiss(true);
  }, [setDismiss]);

  const onOpenChange = useCallback((v: boolean) => {
    setOpen(v);
    // should set dismiss here ?
    // setDismiss(true)
  }, []);

  return (
    <Modal
      withoutCloseButton
      contentOptions={contentOptions}
      overlayOptions={overlayOptions}
      open={open}
      width={400}
      onOpenChange={onOpenChange}
    >
      <Thumb />
      <div className={styles.title}>
        {t['com.affine.onboarding.workspace-guide.title']()}
      </div>
      <div className={styles.content}>
        {t['com.affine.onboarding.workspace-guide.content']()}
      </div>
      <div className={styles.footer}>
        <Button type="primary" size="large" onClick={gotIt}>
          <span className={styles.gotItBtn}>
            {t['com.affine.onboarding.workspace-guide.got-it']()}
          </span>
        </Button>
      </div>
    </Modal>
  );
});
