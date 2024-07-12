import { toast } from '@affine/component';
import { IconButton } from '@affine/component/ui/button';
import { Menu } from '@affine/component/ui/menu';
import { InfoModal } from '@affine/core/components/affine/page-properties';
import { FavoriteItemsAdapter } from '@affine/core/modules/properties';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { MoreHorizontalIcon } from '@blocksuite/icons/rc';
import { useService, useServices, WorkspaceService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import { useTrashModalHelper } from '../../../../hooks/affine/use-trash-modal-helper';
import { usePageHelper } from '../../../blocksuite/block-suite-page-list/utils';
import { OperationItems } from './operation-item';

export type OperationMenuButtonProps = {
  pageId: string;
  pageTitle: string;
  setRenameModalOpen: () => void;
  inFavorites?: boolean;
  isReferencePage?: boolean;
  inAllowList?: boolean;
  removeFromAllowList?: (id: string) => void;
};

export const OperationMenuButton = ({ ...props }: OperationMenuButtonProps) => {
  const {
    pageId,
    pageTitle,
    setRenameModalOpen,
    removeFromAllowList,
    inAllowList,
    inFavorites,
    isReferencePage,
  } = props;
  const t = useI18n();
  const [openInfoModal, setOpenInfoModal] = useState(false);

  const { workspaceService } = useServices({
    WorkspaceService,
  });
  const page = workspaceService.workspace.docCollection.getDoc(pageId);
  const { createLinkedPage } = usePageHelper(
    workspaceService.workspace.docCollection
  );
  const { setTrashModal } = useTrashModalHelper(
    workspaceService.workspace.docCollection
  );

  const favAdapter = useService(FavoriteItemsAdapter);
  const workbench = useService(WorkbenchService).workbench;

  const handleRename = useCallback(() => {
    setRenameModalOpen?.();
  }, [setRenameModalOpen]);

  const handleAddLinkedPage = useCallback(() => {
    createLinkedPage(pageId);
    toast(t['com.affine.toastMessage.addLinkedPage']());
  }, [createLinkedPage, pageId, t]);

  const handleRemoveFromFavourites = useCallback(() => {
    favAdapter.remove(pageId, 'doc');
    toast(t['com.affine.toastMessage.removedFavorites']());
  }, [favAdapter, pageId, t]);

  const handleDelete = useCallback(() => {
    setTrashModal({
      open: true,
      pageIds: [pageId],
      pageTitles: [pageTitle],
    });
  }, [pageId, pageTitle, setTrashModal]);

  const handleRemoveFromAllowList = useCallback(() => {
    removeFromAllowList?.(pageId);
  }, [pageId, removeFromAllowList]);

  const handleOpenInSplitView = useCallback(() => {
    workbench.openDoc(pageId, { at: 'tail' });
  }, [pageId, workbench]);

  const handleOpenInfoModal = useCallback(() => {
    setOpenInfoModal(true);
  }, [setOpenInfoModal]);

  return (
    <>
      <Menu
        items={
          <OperationItems
            onAddLinkedPage={handleAddLinkedPage}
            onDelete={handleDelete}
            onRemoveFromAllowList={handleRemoveFromAllowList}
            onRemoveFromFavourites={handleRemoveFromFavourites}
            onRename={handleRename}
            onOpenInSplitView={handleOpenInSplitView}
            onOpenInfoModal={handleOpenInfoModal}
            inAllowList={inAllowList}
            inFavorites={inFavorites}
            isReferencePage={isReferencePage}
          />
        }
      >
        <IconButton
          size="small"
          type="plain"
          data-testid="left-sidebar-page-operation-button"
          style={{ marginLeft: 4 }}
        >
          <MoreHorizontalIcon />
        </IconButton>
      </Menu>
      {page ? (
        <InfoModal
          open={openInfoModal}
          onOpenChange={setOpenInfoModal}
          page={page}
          workspace={workspaceService.workspace}
        />
      ) : null}
    </>
  );
};
