import { OverlayModal } from '@affine/component';
import { openHistoryTipsModalAtom } from '@affine/core/components/atoms';
import { useEnableCloud } from '@affine/core/components/hooks/affine/use-enable-cloud';
import { useI18n } from '@affine/i18n';
import { useService, WorkspaceService } from '@toeverything/infra';
import { useAtom } from 'jotai';
import { useCallback } from 'react';

import TopSvg from './top-svg';

export const HistoryTipsModal = () => {
  const t = useI18n();
  const currentWorkspace = useService(WorkspaceService).workspace;
  const [open, setOpen] = useAtom(openHistoryTipsModalAtom);
  const confirmEnableCloud = useEnableCloud();

  const handleConfirm = useCallback(() => {
    setOpen(false);
    confirmEnableCloud(currentWorkspace);
  }, [confirmEnableCloud, currentWorkspace, setOpen]);

  return (
    <OverlayModal
      open={open}
      topImage={<TopSvg />}
      title={t['com.affine.history-vision.tips-modal.title']()}
      onOpenChange={setOpen}
      description={t['com.affine.history-vision.tips-modal.description']()}
      cancelText={t['com.affine.history-vision.tips-modal.cancel']()}
      confirmButtonOptions={{
        variant: 'primary',
      }}
      onConfirm={handleConfirm}
      confirmText={t['com.affine.history-vision.tips-modal.confirm']()}
    />
  );
};
