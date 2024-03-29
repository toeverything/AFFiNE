import { OverlayModal } from '@affine/component';
import {
  openDisableCloudAlertModalAtom,
  openHistoryTipsModalAtom,
} from '@affine/core/atoms';
import { useEnableCloud } from '@affine/core/hooks/affine/use-enable-cloud';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useService, Workspace } from '@toeverything/infra';
import { useAtom, useSetAtom } from 'jotai';
import { useCallback } from 'react';

import TopSvg from './top-svg';

export const HistoryTipsModal = () => {
  const t = useAFFiNEI18N();
  const currentWorkspace = useService(Workspace);
  const [open, setOpen] = useAtom(openHistoryTipsModalAtom);
  const setTempDisableCloudOpen = useSetAtom(openDisableCloudAlertModalAtom);
  const confirmEnableCloud = useEnableCloud();

  const handleConfirm = useCallback(() => {
    setOpen(false);
    if (runtimeConfig.enableCloud) {
      confirmEnableCloud(currentWorkspace);
      return;
    }
    return setTempDisableCloudOpen(true);
  }, [confirmEnableCloud, currentWorkspace, setOpen, setTempDisableCloudOpen]);

  return (
    <OverlayModal
      open={open}
      topImage={<TopSvg />}
      title={t['com.affine.history-vision.tips-modal.title']()}
      onOpenChange={setOpen}
      description={t['com.affine.history-vision.tips-modal.description']()}
      cancelText={t['com.affine.history-vision.tips-modal.cancel']()}
      confirmButtonOptions={{
        type: 'primary',
      }}
      onConfirm={handleConfirm}
      confirmText={t['com.affine.history-vision.tips-modal.confirm']()}
    />
  );
};
