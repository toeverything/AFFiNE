import {
  IconButton,
  MenuItem,
  MenuSeparator,
  notify,
  useConfirmModal,
} from '@affine/component';
import { usePageHelper } from '@affine/core/blocksuite/block-suite-page-list/utils';
import { IsFavoriteIcon } from '@affine/core/components/pure/icons';
import type { NodeOperation } from '@affine/core/desktop/components/navigation-panel';
import { CollectionService } from '@affine/core/modules/collection';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/favorite';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import {
  DeleteIcon,
  FilterIcon,
  OpenInNewIcon,
  PlusIcon,
  SplitViewIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { CollectionRenameSubMenu } from './dialog';

export const useNavigationPanelCollectionNodeOperations = (
  collectionId: string,
  onOpenCollapsed: () => void,
  onOpenEdit: () => void
) => {
  const t = useI18n();
  const {
    workbenchService,
    workspaceService,
    collectionService,
    compatibleFavoriteItemsAdapter,
  } = useServices({
    WorkbenchService,
    WorkspaceService,
    CollectionService,
    CompatibleFavoriteItemsAdapter,
  });

  const { createPage } = usePageHelper(
    workspaceService.workspace.docCollection
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
    collectionService.addDocToCollection(collectionId, newDoc.id);
    track.$.navigationPanel.collections.createDoc();
    track.$.navigationPanel.collections.addDocToCollection({
      control: 'button',
    });
    onOpenCollapsed();
  }, [collectionId, collectionService, createPage, onOpenCollapsed]);

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
    collectionService.deleteCollection(collectionId);
    track.$.navigationPanel.organize.deleteOrganizeItem({
      type: 'collection',
    });
  }, [collectionId, collectionService]);

  const handleShowEdit = useCallback(() => {
    onOpenEdit();
  }, [onOpenEdit]);

  const handleRename = useCallback(
    (name: string) => {
      const collection = collectionService.collection$(collectionId).value;
      if (collection && collection.name$.value !== name) {
        collectionService.updateCollection(collectionId, {
          name,
        });

        track.$.navigationPanel.organize.renameOrganizeItem({
          type: 'collection',
        });
        notify.success({ message: t['com.affine.toastMessage.rename']() });
      }
    },
    [collectionId, collectionService, t]
  );

  return useMemo(
    () => ({
      favorite,
      handleAddDocToCollection,
      handleDeleteCollection,
      handleOpenInNewTab,
      handleOpenInSplitView,
      handleShowEdit,
      handleToggleFavoriteCollection,
      handleRename,
    }),
    [
      favorite,
      handleAddDocToCollection,
      handleDeleteCollection,
      handleOpenInNewTab,
      handleOpenInSplitView,
      handleRename,
      handleShowEdit,
      handleToggleFavoriteCollection,
    ]
  );
};

export const useNavigationPanelCollectionNodeOperationsMenu = (
  collectionId: string,
  onOpenCollapsed: () => void,
  onOpenEdit: () => void
): NodeOperation[] => {
  const t = useI18n();

  const {
    favorite,
    handleAddDocToCollection,
    handleDeleteCollection,
    handleOpenInNewTab,
    handleOpenInSplitView,
    handleShowEdit,
    handleToggleFavoriteCollection,
    handleRename,
  } = useNavigationPanelCollectionNodeOperations(
    collectionId,
    onOpenCollapsed,
    onOpenEdit
  );

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
        index: 10,
        view: <CollectionRenameSubMenu onConfirm={handleRename} />,
      },
      {
        index: 11,
        view: <MenuSeparator />,
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
      ...(BUILD_CONFIG.isElectron
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
      favorite,
      handleAddDocToCollection,
      handleDeleteCollection,
      handleOpenInNewTab,
      handleOpenInSplitView,
      handleRename,
      handleShowEdit,
      handleToggleFavoriteCollection,
      t,
    ]
  );
};
