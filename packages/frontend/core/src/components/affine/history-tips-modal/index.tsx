import { OverlayModal } from '@affine/component';
import {
  openDisableCloudAlertModalAtom,
  openHistoryTipsModalAtom,
} from '@affine/core/atoms';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { WorkspaceSubPath } from '@affine/core/shared';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useService, Workspace, WorkspaceManager } from '@toeverything/infra';
import { useAtom, useSetAtom } from 'jotai';
import { useCallback, useState } from 'react';

import { EnableAffineCloudModal } from '../enable-affine-cloud-modal';
import TopSvg from './top-svg';

export const HistoryTipsModal = () => {
  const t = useAFFiNEI18N();
  const { openPage } = useNavigateHelper();
  const workspaceManager = useService(WorkspaceManager);
  const currentWorkspace = useService(Workspace);
  const [open, setOpen] = useAtom(openHistoryTipsModalAtom);
  const setTempDisableCloudOpen = useSetAtom(openDisableCloudAlertModalAtom);
  const [openEnableCloudModal, setOpenEnableCloudModal] = useState(false);

  const handleConfirm = useCallback(() => {
    setOpen(false);
    if (runtimeConfig.enableCloud) {
      return setOpenEnableCloudModal(true);
    }
    return setTempDisableCloudOpen(true);
  }, [setOpen, setTempDisableCloudOpen]);

  const handEnableCloud = useAsyncCallback(async () => {
    if (!currentWorkspace) {
      return;
    }
    const { id: newId } =
      await workspaceManager.transformLocalToCloud(currentWorkspace);
    openPage(newId, WorkspaceSubPath.ALL);
    setOpenEnableCloudModal(false);
  }, [openPage, currentWorkspace, workspaceManager]);

  return (
    <>
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
      <EnableAffineCloudModal
        open={openEnableCloudModal}
        onOpenChange={setOpenEnableCloudModal}
        onConfirm={handEnableCloud}
      />
    </>
  );
};
