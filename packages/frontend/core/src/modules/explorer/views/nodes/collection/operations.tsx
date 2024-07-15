import {
  IconButton,
  MenuIcon,
  MenuItem,
  MenuSeparator,
  useConfirmModal,
} from '@affine/component';
import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { useDeleteCollectionInfo } from '@affine/core/hooks/affine/use-delete-collection-info';
import { CollectionService } from '@affine/core/modules/collection';
import { FavoriteItemsAdapter } from '@affine/core/modules/properties';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import {
  DeleteIcon,
  FavoritedIcon,
  FavoriteIcon,
  FilterIcon,
  PlusIcon,
  SplitViewIcon,
} from '@blocksuite/icons/rc';
import { DocsService, useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import type { NodeOperation } from '../../tree/types';

export const useExplorerCollectionNodeOperations = (
  collectionId: string,
  onOpenCollapsed: () => void,
  onOpenEdit: () => void
): NodeOperation[] => {
  const t = useI18n();
  const { appSettings } = useAppSettingHelper();
  const {
    workbenchService,
    docsService,
    collectionService,
    favoriteItemsAdapter,
  } = useServices({
    DocsService,
    WorkbenchService,
    CollectionService,
    FavoriteItemsAdapter,
  });
  const deleteInfo = useDeleteCollectionInfo();

  const favorite = useLiveData(
    useMemo(
      () => favoriteItemsAdapter.isFavorite$(collectionId, 'collection'),
      [collectionId, favoriteItemsAdapter]
    )
  );
  const { openConfirmModal } = useConfirmModal();

  const createAndAddDocument = useCallback(() => {
    const newDoc = docsService.createDoc();
    collectionService.addPageToCollection(collectionId, newDoc.id);
    workbenchService.workbench.openDoc(newDoc.id);
    onOpenCollapsed();
  }, [
    collectionId,
    collectionService,
    docsService,
    onOpenCollapsed,
    workbenchService.workbench,
  ]);

  const handleToggleFavoritePage = useCallback(() => {
    favoriteItemsAdapter.toggle(collectionId, 'collection');
  }, [favoriteItemsAdapter, collectionId]);

  const handleAddDocToCollection = useCallback(() => {
    openConfirmModal({
      title: t['com.affine.collection.add-doc.confirm.title'](),
      description: t['com.affine.collection.add-doc.confirm.description'](),
      cancelText: t['Cancel'](),
      confirmButtonOptions: {
        type: 'primary',
        children: t['Confirm'](),
      },
      onConfirm: createAndAddDocument,
    });
  }, [createAndAddDocument, openConfirmModal, t]);

  const handleOpenInSplitView = useCallback(() => {
    workbenchService.workbench.openCollection(collectionId, { at: 'beside' });
  }, [collectionId, workbenchService.workbench]);

  const handleDeleteCollection = useCallback(() => {
    collectionService.deleteCollection(deleteInfo, collectionId);
  }, [collectionId, collectionService, deleteInfo]);

  const handleShowEdit = useCallback(() => {
    onOpenEdit();
  }, [onOpenEdit]);

  return useMemo(
    () => [
      {
        index: 0,
        inline: true,
        view: (
          <IconButton
            size="small"
            type="plain"
            onClick={handleAddDocToCollection}
          >
            <PlusIcon />
          </IconButton>
        ),
      },
      {
        index: 99,
        view: (
          <MenuItem
            preFix={
              <MenuIcon>
                <FilterIcon />
              </MenuIcon>
            }
            onClick={handleShowEdit}
          >
            {t['com.affine.collection.menu.edit']()}
          </MenuItem>
        ),
      },
      {
        index: 99,
        view: (
          <MenuItem
            preFix={
              <MenuIcon>
                <PlusIcon />
              </MenuIcon>
            }
            onClick={handleAddDocToCollection}
          >
            {t['New Page']()}
          </MenuItem>
        ),
      },
      {
        index: 99,
        view: (
          <MenuItem
            preFix={
              <MenuIcon>
                {favorite ? (
                  <FavoritedIcon
                    style={{ color: 'var(--affine-primary-color)' }}
                  />
                ) : (
                  <FavoriteIcon />
                )}
              </MenuIcon>
            }
            onClick={handleToggleFavoritePage}
          >
            {favorite
              ? t['com.affine.favoritePageOperation.remove']()
              : t['com.affine.favoritePageOperation.add']()}
          </MenuItem>
        ),
      },
      ...(appSettings.enableMultiView
        ? [
            {
              index: 99,
              view: (
                <MenuItem
                  preFix={
                    <MenuIcon>
                      <SplitViewIcon />
                    </MenuIcon>
                  }
                  onClick={handleOpenInSplitView}
                >
                  {t['com.affine.workbench.split-view.page-menu-open']()}
                </MenuItem>
              ),
            },
          ]
        : []),
      {
        index: 9999,
        view: <MenuSeparator key="menu-separator" />,
      },
      {
        index: 10000,
        view: (
          <MenuItem
            type={'danger'}
            preFix={
              <MenuIcon>
                <DeleteIcon />
              </MenuIcon>
            }
            onClick={handleDeleteCollection}
          >
            {t['Delete']()}
          </MenuItem>
        ),
      },
    ],
    [
      appSettings.enableMultiView,
      favorite,
      handleAddDocToCollection,
      handleDeleteCollection,
      handleOpenInSplitView,
      handleShowEdit,
      handleToggleFavoritePage,
      t,
    ]
  );
};
