import {
  IconButton,
  Menu,
  MenuItem,
  toast,
  useConfirmModal,
} from '@affine/component';
import { useBlockSuiteMetaHelper } from '@affine/core/hooks/affine/use-block-suite-meta-helper';
import { useTrashModalHelper } from '@affine/core/hooks/affine/use-trash-modal-helper';
import { useCatchEventCallback } from '@affine/core/hooks/use-catch-event-hook';
import { track } from '@affine/core/mixpanel';
import { FavoriteService } from '@affine/core/modules/favorite';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/properties';
import { WorkbenchService } from '@affine/core/modules/workbench';
import type { Collection, DeleteCollectionInfo } from '@affine/env/filter';
import { useI18n } from '@affine/i18n';
import {
  DeleteIcon,
  DeletePermanentlyIcon,
  DuplicateIcon,
  EditIcon,
  FilterIcon,
  FilterMinusIcon,
  InformationIcon,
  MoreVerticalIcon,
  OpenInNewIcon,
  PlusIcon,
  ResetIcon,
  SplitViewIcon,
} from '@blocksuite/icons/rc';
import type { DocMeta } from '@blocksuite/store';
import {
  FeatureFlagService,
  useLiveData,
  useServices,
  WorkspaceService,
} from '@toeverything/infra';
import type { MouseEvent } from 'react';
import { useCallback, useState } from 'react';

import type { CollectionService } from '../../modules/collection';
import { InfoModal } from '../affine/page-properties';
import { usePageHelper } from '../blocksuite/block-suite-page-list/utils';
import { IsFavoriteIcon } from '../pure/icons';
import { FavoriteTag } from './components/favorite-tag';
import * as styles from './list.css';
import { DisablePublicSharing, MoveToTrash } from './operation-menu-items';
import { CreateOrEditTag } from './tags/create-tag';
import type { TagMeta } from './types';
import { ColWrapper } from './utils';
import { useEditCollection, useEditCollectionName } from './view';

const tooltipSideTop = { side: 'top' as const };
const tooltipSideTopAlignEnd = { side: 'top' as const, align: 'end' as const };

export interface PageOperationCellProps {
  page: DocMeta;
  isInAllowList?: boolean;
  onRemoveFromAllowList?: () => void;
}

export const PageOperationCell = ({
  isInAllowList,
  page,
  onRemoveFromAllowList,
}: PageOperationCellProps) => {
  const t = useI18n();
  const {
    featureFlagService,
    workspaceService,
    compatibleFavoriteItemsAdapter: favAdapter,
    workbenchService,
  } = useServices({
    FeatureFlagService,
    WorkspaceService,
    CompatibleFavoriteItemsAdapter,
    WorkbenchService,
  });
  const enableSplitView = useLiveData(
    featureFlagService.flags.enable_multi_view.$
  );
  const currentWorkspace = workspaceService.workspace;
  const { setTrashModal } = useTrashModalHelper();
  const favourite = useLiveData(favAdapter.isFavorite$(page.id, 'doc'));
  const workbench = workbenchService.workbench;
  const { duplicate } = useBlockSuiteMetaHelper();
  const blocksuiteDoc = currentWorkspace.docCollection.getDoc(page.id);

  const [openInfoModal, setOpenInfoModal] = useState(false);
  const onOpenInfoModal = useCallback(() => {
    track.$.docInfoPanel.$.open();
    setOpenInfoModal(true);
  }, []);

  const onDisablePublicSharing = useCallback(() => {
    // TODO(@EYHN): implement disable public sharing
    toast('Successfully disabled', {
      portal: document.body,
    });
  }, []);

  const onRemoveToTrash = useCallback(() => {
    track.allDocs.list.docMenu.deleteDoc();

    setTrashModal({
      open: true,
      pageIds: [page.id],
      pageTitles: [page.title],
    });
  }, [page.id, page.title, setTrashModal]);

  const onOpenInSplitView = useCallback(() => {
    track.allDocs.list.docMenu.openInSplitView();

    workbench.openDoc(page.id, { at: 'tail' });
  }, [page.id, workbench]);

  const onOpenInNewTab = useCallback(() => {
    workbench.openDoc(page.id, { at: 'new-tab' });
  }, [page.id, workbench]);

  const onToggleFavoritePage = useCallback(() => {
    const status = favAdapter.isFavorite(page.id, 'doc');
    favAdapter.toggle(page.id, 'doc');
    toast(
      status
        ? t['com.affine.toastMessage.removedFavorites']()
        : t['com.affine.toastMessage.addedFavorites']()
    );
  }, [page.id, favAdapter, t]);

  const onToggleFavoritePageOption = useCallback(() => {
    track.allDocs.list.docMenu.toggleFavorite();

    onToggleFavoritePage();
  }, [onToggleFavoritePage]);

  const onDuplicate = useCallback(() => {
    duplicate(page.id, false);
    track.allDocs.list.docMenu.createDoc({
      control: 'duplicate',
    });
  }, [duplicate, page.id]);

  const handleRemoveFromAllowList = useCallback(() => {
    if (onRemoveFromAllowList) {
      onRemoveFromAllowList();
      track.collection.docList.docMenu.removeOrganizeItem({ type: 'doc' });
    }
  }, [onRemoveFromAllowList]);

  const OperationMenu = (
    <>
      {page.isPublic && (
        <DisablePublicSharing
          data-testid="disable-public-sharing"
          onSelect={onDisablePublicSharing}
        />
      )}
      {isInAllowList && (
        <MenuItem
          onClick={handleRemoveFromAllowList}
          prefixIcon={<FilterMinusIcon />}
        >
          {t['Remove special filter']()}
        </MenuItem>
      )}
      <MenuItem
        onClick={onToggleFavoritePageOption}
        prefixIcon={<IsFavoriteIcon favorite={favourite} />}
      >
        {favourite
          ? t['com.affine.favoritePageOperation.remove']()
          : t['com.affine.favoritePageOperation.add']()}
      </MenuItem>
      <MenuItem onClick={onOpenInfoModal} prefixIcon={<InformationIcon />}>
        {t['com.affine.page-properties.page-info.view']()}
      </MenuItem>
      <MenuItem onClick={onOpenInNewTab} prefixIcon={<OpenInNewIcon />}>
        {t['com.affine.workbench.tab.page-menu-open']()}
      </MenuItem>
      {BUILD_CONFIG.isElectron && enableSplitView ? (
        <MenuItem onClick={onOpenInSplitView} prefixIcon={<SplitViewIcon />}>
          {t['com.affine.workbench.split-view.page-menu-open']()}
        </MenuItem>
      ) : null}

      <MenuItem prefixIcon={<DuplicateIcon />} onSelect={onDuplicate}>
        {t['com.affine.header.option.duplicate']()}
      </MenuItem>

      <MoveToTrash data-testid="move-to-trash" onSelect={onRemoveToTrash} />
    </>
  );
  return (
    <>
      <ColWrapper
        hideInSmallContainer
        data-testid="page-list-item-favorite"
        data-favorite={favourite ? true : undefined}
        className={styles.favoriteCell}
      >
        <FavoriteTag onClick={onToggleFavoritePage} active={favourite} />
      </ColWrapper>
      <ColWrapper alignment="start">
        <Menu
          items={OperationMenu}
          contentOptions={{
            align: 'end',
          }}
        >
          <IconButton data-testid="page-list-operation-button" size="20">
            <MoreVerticalIcon />
          </IconButton>
        </Menu>
      </ColWrapper>
      {blocksuiteDoc ? (
        <InfoModal
          open={openInfoModal}
          onOpenChange={setOpenInfoModal}
          docId={blocksuiteDoc.id}
        />
      ) : null}
    </>
  );
};

export interface TrashOperationCellProps {
  onPermanentlyDeletePage: () => void;
  onRestorePage: () => void;
}

export const TrashOperationCell = ({
  onPermanentlyDeletePage,
  onRestorePage,
}: TrashOperationCellProps) => {
  const t = useI18n();
  const { openConfirmModal } = useConfirmModal();

  const onConfirmPermanentlyDelete = useCatchEventCallback(
    e => {
      e.preventDefault();
      openConfirmModal({
        title: `${t['com.affine.trashOperation.deletePermanently']()}?`,
        description: t['com.affine.trashOperation.deleteDescription'](),
        cancelText: t['Cancel'](),
        confirmText: t['com.affine.trashOperation.delete'](),
        confirmButtonOptions: {
          variant: 'error',
        },
        onConfirm: onPermanentlyDeletePage,
      });
    },
    [onPermanentlyDeletePage, openConfirmModal, t]
  );

  const handleRestorePage = useCatchEventCallback(
    e => {
      e.preventDefault();
      onRestorePage();
    },
    [onRestorePage]
  );

  return (
    <ColWrapper flex={1}>
      <IconButton
        tooltip={t['com.affine.trashOperation.restoreIt']()}
        tooltipOptions={tooltipSideTop}
        data-testid="restore-page-button"
        style={{ marginRight: '12px' }}
        onClick={handleRestorePage}
        size="20"
      >
        <ResetIcon />
      </IconButton>
      <IconButton
        tooltip={t['com.affine.trashOperation.deletePermanently']()}
        tooltipOptions={tooltipSideTopAlignEnd}
        data-testid="delete-page-button"
        onClick={onConfirmPermanentlyDelete}
        className={styles.deleteButton}
        iconClassName={styles.deleteIcon}
        size="20"
      >
        <DeletePermanentlyIcon />
      </IconButton>
    </ColWrapper>
  );
};

export interface CollectionOperationCellProps {
  collection: Collection;
  info: DeleteCollectionInfo;
  service: CollectionService;
}

export const CollectionOperationCell = ({
  collection,
  service,
  info,
}: CollectionOperationCellProps) => {
  const t = useI18n();
  const { compatibleFavoriteItemsAdapter: favAdapter, workspaceService } =
    useServices({
      CompatibleFavoriteItemsAdapter,
      WorkspaceService,
    });
  const docCollection = workspaceService.workspace.docCollection;
  const { createPage } = usePageHelper(docCollection);
  const { openConfirmModal } = useConfirmModal();
  const favourite = useLiveData(
    favAdapter.isFavorite$(collection.id, 'collection')
  );

  const { open: openEditCollectionModal } = useEditCollection();

  const { open: openEditCollectionNameModal } = useEditCollectionName({
    title: t['com.affine.editCollection.renameCollection'](),
  });

  const handlePropagation = useCallback((event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleEditName = useCallback(
    (event: MouseEvent) => {
      handlePropagation(event);
      // use openRenameModal if it is in the sidebar collection list
      openEditCollectionNameModal(collection.name)
        .then(name => {
          return service.updateCollection(collection.id, collection => ({
            ...collection,
            name,
          }));
        })
        .catch(err => {
          console.error(err);
        });
    },
    [
      collection.id,
      collection.name,
      handlePropagation,
      openEditCollectionNameModal,
      service,
    ]
  );

  const handleEdit = useCallback(
    (event: MouseEvent) => {
      handlePropagation(event);
      openEditCollectionModal(collection)
        .then(collection => {
          return service.updateCollection(collection.id, () => collection);
        })
        .catch(err => {
          console.error(err);
        });
    },
    [handlePropagation, openEditCollectionModal, collection, service]
  );

  const handleDelete = useCallback(() => {
    return service.deleteCollection(info, collection.id);
  }, [service, info, collection]);

  const onToggleFavoriteCollection = useCallback(() => {
    const status = favAdapter.isFavorite(collection.id, 'collection');
    favAdapter.toggle(collection.id, 'collection');
    toast(
      status
        ? t['com.affine.toastMessage.removedFavorites']()
        : t['com.affine.toastMessage.addedFavorites']()
    );
  }, [favAdapter, collection.id, t]);

  const createAndAddDocument = useCallback(() => {
    const newDoc = createPage();
    service.addPageToCollection(collection.id, newDoc.id);
  }, [collection.id, createPage, service]);

  const onConfirmAddDocToCollection = useCallback(() => {
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

  return (
    <>
      <ColWrapper
        hideInSmallContainer
        data-testid="page-list-item-favorite"
        data-favorite={favourite ? true : undefined}
        className={styles.favoriteCell}
      >
        <FavoriteTag onClick={onToggleFavoriteCollection} active={favourite} />
      </ColWrapper>
      <IconButton
        onClick={handleEditName}
        tooltip={t['com.affine.collection.menu.rename']()}
        tooltipOptions={tooltipSideTop}
      >
        <EditIcon />
      </IconButton>
      <IconButton
        onClick={handleEdit}
        tooltip={t['com.affine.collection.menu.edit']()}
        tooltipOptions={tooltipSideTop}
      >
        <FilterIcon />
      </IconButton>
      <ColWrapper alignment="start">
        <Menu
          items={
            <>
              <MenuItem
                onClick={onToggleFavoriteCollection}
                prefixIcon={<IsFavoriteIcon favorite={favourite} />}
              >
                {favourite
                  ? t['com.affine.favoritePageOperation.remove']()
                  : t['com.affine.favoritePageOperation.add']()}
              </MenuItem>
              <MenuItem
                onClick={onConfirmAddDocToCollection}
                prefixIcon={<PlusIcon />}
              >
                {t['New Page']()}
              </MenuItem>
              <MenuItem
                onClick={handleDelete}
                prefixIcon={<DeleteIcon />}
                type="danger"
                data-testid="delete-collection"
              >
                {t['Delete']()}
              </MenuItem>
            </>
          }
          contentOptions={{
            align: 'end',
          }}
        >
          <IconButton data-testid="collection-item-operation-button">
            <MoreVerticalIcon />
          </IconButton>
        </Menu>
      </ColWrapper>
    </>
  );
};

interface TagOperationCellProps {
  tag: TagMeta;
  onTagDelete: (tagId: string[]) => void;
}

export const TagOperationCell = ({
  tag,
  onTagDelete,
}: TagOperationCellProps) => {
  const t = useI18n();
  const [open, setOpen] = useState(false);
  const { favoriteService } = useServices({
    FavoriteService,
  });
  const favourite = useLiveData(
    favoriteService.favoriteList.isFavorite$('tag', tag.id)
  );

  const handleDelete = useCallback(() => {
    onTagDelete([tag.id]);
  }, [onTagDelete, tag.id]);

  const onToggleFavoriteCollection = useCallback(() => {
    favoriteService.favoriteList.toggle('tag', tag.id);
  }, [favoriteService, tag.id]);
  return (
    <>
      <ColWrapper
        hideInSmallContainer
        data-testid="page-list-item-favorite"
        data-favorite={favourite ? true : undefined}
        className={styles.favoriteCell}
      >
        <FavoriteTag onClick={onToggleFavoriteCollection} active={favourite} />
      </ColWrapper>

      <div className={styles.editTagWrapper} data-show={open}>
        <div style={{ width: '100%' }}>
          <CreateOrEditTag open={open} onOpenChange={setOpen} tagMeta={tag} />
        </div>
      </div>

      <IconButton
        tooltip={t['Rename']()}
        tooltipOptions={tooltipSideTop}
        onClick={useCallback(
          (e: React.MouseEvent<HTMLButtonElement>) => {
            e.preventDefault();
            setOpen(true);
          },
          [setOpen]
        )}
      >
        <EditIcon />
      </IconButton>

      <ColWrapper alignment="start">
        <Menu
          items={
            <MenuItem
              prefixIcon={<DeleteIcon />}
              type="danger"
              onSelect={handleDelete}
              data-testid="delete-tag"
            >
              {t['Delete']()}
            </MenuItem>
          }
          contentOptions={{
            align: 'end',
          }}
        >
          <IconButton data-testid="tag-item-operation-button">
            <MoreVerticalIcon />
          </IconButton>
        </Menu>
      </ColWrapper>
    </>
  );
};
