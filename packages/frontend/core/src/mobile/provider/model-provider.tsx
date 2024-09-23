import { NotificationCenter } from '@affine/component';
import { AiLoginRequiredModal } from '@affine/core/components/affine/auth/ai-login-required';
import { HistoryTipsModal } from '@affine/core/components/affine/history-tips-modal';
import { IssueFeedbackModal } from '@affine/core/components/affine/issue-feedback-modal';
import { InfoModal } from '@affine/core/components/affine/page-properties/info-modal/info-modal';
import {
  CloudQuotaModal,
  LocalQuotaModal,
} from '@affine/core/components/affine/quota-reached-modal';
import { StarAFFiNEModal } from '@affine/core/components/affine/star-affine-modal';
import { useTrashModalHelper } from '@affine/core/components/hooks/affine/use-trash-modal-helper';
import { MoveToTrash } from '@affine/core/components/page-list';
import { SignOutConfirmModal } from '@affine/core/components/providers/modal-provider';
import { CreateWorkspaceDialogProvider } from '@affine/core/modules/create-workspace';
import { PeekViewManagerModal } from '@affine/core/modules/peek-view';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useService, WorkspaceService } from '@toeverything/infra';
import { useCallback } from 'react';

import { MobileSettingModal } from '../views';
import { MobileSignInModal } from '../views/sign-in/modal';

export function MobileCurrentWorkspaceModals() {
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
      {currentWorkspace ? <MobileSettingModal /> : null}
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
      <MoveToTrash.ConfirmModal
        open={trashConfirmOpen}
        onConfirm={handleOnConfirm}
        onOpenChange={onTrashConfirmOpenChange}
        titles={deletePageTitles}
      />
      <InfoModal />
    </>
  );
}

// I don't like the name, but let's keep it for now
export const AllWorkspaceModals = () => {
  return (
    <>
      <NotificationCenter />
      <CreateWorkspaceDialogProvider />
      <MobileSignInModal />
      <SignOutConfirmModal />
    </>
  );
};
