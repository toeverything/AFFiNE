import { NotificationCenter } from '@affine/component';
import { useTrashModalHelper } from '@affine/core/components/hooks/affine/use-trash-modal-helper';
import { MoveToTrash } from '@affine/core/components/page-list';
import { PeekViewManagerModal } from '@affine/core/modules/peek-view';
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
      {currentWorkspace ? <MobileSettingModal /> : null}
      <PeekViewManagerModal />
      <MoveToTrash.ConfirmModal
        open={trashConfirmOpen}
        onConfirm={handleOnConfirm}
        onOpenChange={onTrashConfirmOpenChange}
        titles={deletePageTitles}
      />
    </>
  );
}

// I don't like the name, but let's keep it for now
export const AllWorkspaceModals = () => {
  return (
    <>
      <NotificationCenter />
      <MobileSignInModal />
    </>
  );
};
