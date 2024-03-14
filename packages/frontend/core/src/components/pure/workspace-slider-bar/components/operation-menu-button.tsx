import { toast } from '@affine/component';
import { IconButton } from '@affine/component/ui/button';
import { Menu } from '@affine/component/ui/menu';
import { Workbench } from '@affine/core/modules/workbench';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { MoreHorizontalIcon } from '@blocksuite/icons';
import type { DocCollection } from '@blocksuite/store';
import { useService } from '@toeverything/infra/di';
import { useCallback } from 'react';

import { useBlockSuiteMetaHelper } from '../../../../hooks/affine/use-block-suite-meta-helper';
import { useTrashModalHelper } from '../../../../hooks/affine/use-trash-modal-helper';
import { usePageHelper } from '../../../blocksuite/block-suite-page-list/utils';
import { OperationItems } from './operation-item';

export type OperationMenuButtonProps = {
  pageId: string;
  docCollection: DocCollection;
  pageTitle: string;
  setRenameModalOpen: () => void;
  inFavorites?: boolean;
  isReferencePage?: boolean;
  inAllowList?: boolean;
  removeFromAllowList?: (id: string) => void;
};

export const OperationMenuButton = ({ ...props }: OperationMenuButtonProps) => {
  const {
    docCollection,
    pageId,
    pageTitle,
    setRenameModalOpen,
    removeFromAllowList,
    inAllowList,
    inFavorites,
    isReferencePage,
  } = props;
  const t = useAFFiNEI18N();
  const { createLinkedPage } = usePageHelper(docCollection);
  const { setTrashModal } = useTrashModalHelper(docCollection);
  const { removeFromFavorite } = useBlockSuiteMetaHelper(docCollection);
  const workbench = useService(Workbench);

  const handleRename = useCallback(() => {
    setRenameModalOpen?.();
  }, [setRenameModalOpen]);

  const handleAddLinkedPage = useCallback(() => {
    createLinkedPage(pageId);
    toast(t['com.affine.toastMessage.addLinkedPage']());
  }, [createLinkedPage, pageId, t]);

  const handleRemoveFromFavourites = useCallback(() => {
    removeFromFavorite(pageId);
    toast(t['com.affine.toastMessage.removedFavorites']());
  }, [pageId, removeFromFavorite, t]);

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
    workbench.openPage(pageId, { at: 'tail' });
  }, [pageId, workbench]);

  return (
    <Menu
      items={
        <OperationItems
          onAddLinkedPage={handleAddLinkedPage}
          onDelete={handleDelete}
          onRemoveFromAllowList={handleRemoveFromAllowList}
          onRemoveFromFavourites={handleRemoveFromFavourites}
          onRename={handleRename}
          onOpenInSplitView={handleOpenInSplitView}
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
  );
};
