import {
  IconButton,
  MenuItem,
  MenuSeparator,
  useConfirmModal,
} from '@affine/component';
import { usePageHelper } from '@affine/core/components/blocksuite/block-suite-page-list/utils';
import { useDeleteCollectionInfo } from '@affine/core/components/hooks/affine/use-delete-collection-info';
import { IsFavoriteIcon } from '@affine/core/components/pure/icons';
import { CollectionService } from '@affine/core/modules/collection';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/properties';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import {
  DeleteIcon,
  FilterIcon,
  OpenInNewIcon,
  PlusIcon,
  SplitViewIcon,
} from '@blocksuite/icons/rc';
import {
  FeatureFlagService,
  useLiveData,
  useServices,
  WorkspaceService,
} from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import type { NodeOperation } from '../../tree/types';

export const useExplorerCollectionNodeOperations = (
  collectionId: string,
  onOpenCollapsed: () => void,
  onOpenEdit: () => void
): NodeOperation[] => {
  const t = useI18n();
  const {
    workbenchService,
    workspaceService,
    collectionService,
    compatibleFavoriteItemsAdapter,
    featureFlagService,
  } = useServices({
    WorkbenchService,
    WorkspaceService,
    CollectionService,
    CompatibleFavoriteItemsAdapter,
    FeatureFlagService,
  });
  const deleteInfo = useDeleteCollectionInfo();

  const { createPage } = usePageHelper(
    workspaceService.workspace.docCollection
  );

  const enableMultiView = useLiveData(
    featureFlagService.flags.enable_multi_view.$
  );
  const favorite = useLiveData(
    useMemo(
      () =>
        compatibleFavoriteItemsAdapter.isFavorite$(collectionId, 'collection'),
      [collectionId, compatibleFavoriteItemsAdapter]
    )
  );
  const { openConfirmModal } = useConfirmModal();

  const createAndAddDocument = useCallback(() => {
    const newDoc = createPage();
    collectionService.addPageToCollection(collectionId, newDoc.id);
    track.$.navigationPanel.collections.createDoc();
    track.$.navigationPanel.collections.addDocToCollection({
      control: 'button',
    });
    workbenchService.workbench.openDoc(newDoc.id);
    onOpenCollapsed();
  }, [
    collectionId,
    collectionService,
    createPage,
    onOpenCollapsed,
    workbenchService.workbench,
  ]);

  const handleToggleFavoriteCollection = useCallback(() => {
    compatibleFavoriteItemsAdapter.toggle(collectionId, 'collection');
    track.$.navigationPanel.organize.toggleFavorite({
      type: 'collection',
    });
  }, [compatibleFavoriteItemsAdapter, collectionId]);

  const handleAddDocToCollection = useCallback(() => {
    openConfirmModal({
      title: t['com.affine.collection.add-doc.confirm.title'](),
      description: t['com.affine.collection.add-doc.confirm.description'](),
      cancelText: t['Cancel'](),
      confirmText: t['Confirm'](),
      confirmButtonOptions: {
        variant: 'primary',
      },
      onConfirm: createAndAddDocument,
    });
  }, [createAndAddDocument, openConfirmModal, t]);

  const handleOpenInSplitView = useCallback(() => {
    workbenchService.workbench.openCollection(collectionId, { at: 'beside' });
    track.$.navigationPanel.organize.openInSplitView({
      type: 'collection',
    });
  }, [collectionId, workbenchService.workbench]);

  const handleOpenInNewTab = useCallback(() => {
    workbenchService.workbench.openCollection(collectionId, { at: 'new-tab' });
    track.$.navigationPanel.organize.openInNewTab({ type: 'collection' });
  }, [collectionId, workbenchService.workbench]);

  const handleDeleteCollection = useCallback(() => {
    collectionService.deleteCollection(deleteInfo, collectionId);
    track.$.navigationPanel.organize.deleteOrganizeItem({
      type: 'collection',
    });
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
            size="16"
            onClick={handleAddDocToCollection}
            tooltip={t[
              'com.affine.rootAppSidebar.explorer.collection-add-tooltip'
            ]()}
          >
            <PlusIcon />
          </IconButton>
        ),
      },
      {
        index: 99,
        view: (
          <MenuItem prefixIcon={<FilterIcon />} onClick={handleShowEdit}>
            {t['com.affine.collection.menu.edit']()}
          </MenuItem>
        ),
      },
      {
        index: 99,
        view: (
          <MenuItem
            prefixIcon={<PlusIcon />}
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
            prefixIcon={<IsFavoriteIcon favorite={favorite} />}
            onClick={handleToggleFavoriteCollection}
          >
            {favorite
              ? t['com.affine.favoritePageOperation.remove']()
              : t['com.affine.favoritePageOperation.add']()}
          </MenuItem>
        ),
      },
      {
        index: 99,
        view: (
          <MenuItem prefixIcon={<OpenInNewIcon />} onClick={handleOpenInNewTab}>
            {t['com.affine.workbench.tab.page-menu-open']()}
          </MenuItem>
        ),
      },
      ...(BUILD_CONFIG.isElectron && enableMultiView
        ? [
            {
              index: 99,
              view: (
                <MenuItem
                  prefixIcon={<SplitViewIcon />}
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
            prefixIcon={<DeleteIcon />}
            onClick={handleDeleteCollection}
          >
            {t['Delete']()}
          </MenuItem>
        ),
      },
    ],
    [
      enableMultiView,
      favorite,
      handleAddDocToCollection,
      handleDeleteCollection,
      handleOpenInNewTab,
      handleOpenInSplitView,
      handleShowEdit,
      handleToggleFavoriteCollection,
      t,
    ]
  );
};
