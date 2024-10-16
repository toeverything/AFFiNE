import { events } from '@affine/electron-api';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useService, WorkspaceService } from '@toeverything/infra';
import { useAtom } from 'jotai';
import { useCallback, useEffect } from 'react';

import { FindInPageModal } from '../../modules/find-in-page/view/find-in-page-modal';
import { PeekViewManagerModal } from '../../modules/peek-view';
import { AiLoginRequiredModal } from '../affine/auth/ai-login-required';
import { HistoryTipsModal } from '../affine/history-tips-modal';
import { IssueFeedbackModal } from '../affine/issue-feedback-modal';
import {
  CloudQuotaModal,
  LocalQuotaModal,
} from '../affine/quota-reached-modal';
import { SettingModal } from '../affine/setting-modal';
import { StarAFFiNEModal } from '../affine/star-affine-modal';
import type { SettingAtom } from '../atoms';
import { openSettingModalAtom } from '../atoms';
import { InfoModal } from '../doc-properties/info-modal/info-modal';
import { useTrashModalHelper } from '../hooks/affine/use-trash-modal-helper';
import { MoveToTrash } from '../page-list';

export const Setting = () => {
  const [{ open, workspaceMetadata, activeTab }, setOpenSettingModalAtom] =
    useAtom(openSettingModalAtom);

  const onSettingClick = useCallback(
    ({
      activeTab,
      workspaceMetadata,
    }: Pick<SettingAtom, 'activeTab' | 'workspaceMetadata'>) => {
      setOpenSettingModalAtom(prev => ({
        ...prev,
        activeTab,
        workspaceMetadata,
      }));
    },
    [setOpenSettingModalAtom]
  );

  const onOpenChange = useCallback(
    (open: boolean) => {
      setOpenSettingModalAtom(prev => ({ ...prev, open }));
    },
    [setOpenSettingModalAtom]
  );

  useEffect(() => {
    if (BUILD_CONFIG.isElectron) {
      return events?.applicationMenu.openAboutPageInSettingModal(() =>
        setOpenSettingModalAtom({
          activeTab: 'about',
          open: true,
        })
      );
    }
    return;
  }, [setOpenSettingModalAtom]);

  if (!open) {
    return null;
  }

  return (
    <SettingModal
      open={open}
      activeTab={activeTab}
      workspaceMetadata={workspaceMetadata}
      onSettingClick={onSettingClick}
      onOpenChange={onOpenChange}
    />
  );
};

export function CurrentWorkspaceModals() {
  const currentWorkspace = useService(WorkspaceService).workspace;

  const { trashModal, setTrashModal, handleOnConfirm } = useTrashModalHelper();
  const deletePageTitles = trashModal.pageTitles;
  const trashConfirmOpen = trashModal.open;
  const onTrashConfirmOpenChange = useCallback(
    (open: boolean) => {
      setTrashModal({
        ...trashModal,
        open,
      });
    },
    [trashModal, setTrashModal]
  );

  return (
    <>
      <StarAFFiNEModal />
      <IssueFeedbackModal />
      {currentWorkspace ? <Setting /> : null}
      {currentWorkspace?.flavour === WorkspaceFlavour.LOCAL && (
        <>
          <LocalQuotaModal />
          <HistoryTipsModal />
        </>
      )}
      {currentWorkspace?.flavour === WorkspaceFlavour.AFFINE_CLOUD && (
        <CloudQuotaModal />
      )}
      <AiLoginRequiredModal />
      <PeekViewManagerModal />
      {BUILD_CONFIG.isElectron && <FindInPageModal />}
      <MoveToTrash.ConfirmModal
        open={trashConfirmOpen}
        onConfirm={handleOnConfirm}
        onOpenChange={onTrashConfirmOpenChange}
        titles={deletePageTitles}
      />
      {currentWorkspace ? <InfoModal /> : null}
    </>
  );
}
