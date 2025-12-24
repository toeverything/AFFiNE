import {
  IconButton,
  Menu,
  MenuItem,
  toast,
  useConfirmModal,
  usePromptModal,
} from '@affine/component';
import { useBlockSuiteMetaHelper } from '@affine/core/components/hooks/affine/use-block-suite-meta-helper';
import { useCatchEventCallback } from '@affine/core/components/hooks/use-catch-event-hook';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { DocsService } from '@affine/core/modules/doc';
import {
  CompatibleFavoriteItemsAdapter,
  FavoriteService,
} from '@affine/core/modules/favorite';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import type { DocMeta } from '@blocksuite/affine/store';
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
import { useLiveData, useService, useServices } from '@toeverything/infra';
import type { MouseEvent } from 'react';
import { useCallback, useState } from 'react';

import {
  type CollectionMeta,
  CollectionService,
} from '../../modules/collection';
import { useGuard } from '../guard';
import { IsFavoriteIcon } from '../pure/icons';
import { FavoriteTag } from './components/favorite-tag';
import * as styles from './list.css';
import { DisablePublicSharing, MoveToTrash } from './operation-menu-items';
import { CreateOrEditTag } from './tags/create-tag';
import type { TagMeta } from './types';
import { ColWrapper } from './utils';

const tooltipSideTop = { side: 'top' as const };
const tooltipSideTopAlignEnd = { side: 'top' as const, align: 'end' as const };

export interface PageOperationCellProps {
  page: DocMeta;
  isInAllowList?: boolean;
  onRemoveFromAllowList?: () => void;
}

const PageOperationCellMenuItem = ({
  isInAllowList,
  page,
  onRemoveFromAllowList,
}: PageOperationCellProps) => {
  const t = useI18n();
  const {
    workspaceService,
    compatibleFavoriteItemsAdapter: favAdapter,
    workbenchService,
  } = useServices({
    WorkspaceService,
    CompatibleFavoriteItemsAdapter,
    WorkbenchService,
  });

  const canMoveToTrash = useGuard('Doc_Trash', page.id);
  const currentWorkspace = workspaceService.workspace;
  const favourite = useLiveData(favAdapter.isFavorite$(page.id, 'doc'));
  const workbench = workbenchService.workbench;
  const { duplicate } = useBlockSuiteMetaHelper();
  const docRecord = useLiveData(useService(DocsService).list.doc$(page.id));
  const blocksuiteDoc = currentWorkspace.docCollection.getDoc(page.id);

  const workspaceDialogService = useService(WorkspaceDialogService);
  const onOpenInfoModal = useCallback(() => {
    if (blocksuiteDoc?.id) {
      track.$.docInfoPanel.$.open();
      workspaceDialogService.open('doc-info', { docId: blocksuiteDoc.id });
    }
  }, [blocksuiteDoc?.id, workspaceDialogService]);

  const onDisablePublicSharing = useCallback(() => {
    // TODO(@EYHN): implement disable public sharing
    toast('Successfully disabled', {
      portal: document.body,
    });
  }, []);

  const { openConfirmModal } = useConfirmModal();

  const onRemoveToTrash = useCallback(() => {
    if (!docRecord) {
      return;
    }
    track.allDocs.list.docMenu.deleteDoc();

    openConfirmModal({
      title: t['com.affine.moveToTrash.confirmModal.title'](),
      description: t['com.affine.moveToTrash.confirmModal.description']({
        title: docRecord.title$.value || t['Untitled'](),
      }),
      cancelText: t['com.affine.confirmModal.button.cancel'](),
      confirmText: t.Delete(),
      confirmButtonOptions: {
        variant: 'error',
      },
      onConfirm: () => {
        docRecord.moveToTrash();
      },
    });
  }, [docRecord, openConfirmModal, t]);

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

  return (
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
      {BUILD_CONFIG.isElectron ? (
        <MenuItem onClick={onOpenInSplitView} prefixIcon={<SplitViewIcon />}>
          {t['com.affine.workbench.split-view.page-menu-open']()}
        </MenuItem>
      ) : null}

      <MenuItem prefixIcon={<DuplicateIcon />} onSelect={onDuplicate}>
        {t['com.affine.header.option.duplicate']()}
      </MenuItem>

      <MoveToTrash
        data-testid="move-to-trash"
        onSelect={onRemoveToTrash}
        disabled={!canMoveToTrash}
      />
    </>
  );
};

export const PageOperationCell = ({
  isInAllowList,
  page,
  onRemoveFromAllowList,
}: PageOperationCellProps) => {
  const t = useI18n();
  const { compatibleFavoriteItemsAdapter: favAdapter } = useServices({
    CompatibleFavoriteItemsAdapter,
  });

  const favourite = useLiveData(favAdapter.isFavorite$(page.id, 'doc'));

  const onToggleFavoritePage = useCallback(() => {
    const status = favAdapter.isFavorite(page.id, 'doc');
    favAdapter.toggle(page.id, 'doc');
    toast(
      status
        ? t['com.affine.toastMessage.removedFavorites']()
        : t['com.affine.toastMessage.addedFavorites']()
    );
  }, [page.id, favAdapter, t]);
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
          items={
            <PageOperationCellMenuItem
              page={page}
              isInAllowList={isInAllowList}
              onRemoveFromAllowList={onRemoveFromAllowList}
            />
          }
          contentOptions={{
            align: 'end',
          }}
        >
          <IconButton data-testid="page-list-operation-button" size="20">
            <MoreVerticalIcon />
          </IconButton>
        </Menu>
      </ColWrapper>
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
  collectionMeta: CollectionMeta;
}

export const CollectionOperationCell = ({
  collectionMeta,
}: CollectionOperationCellProps) => {
  const t = useI18n();
  const {
    compatibleFavoriteItemsAdapter: favAdapter,
    workspaceDialogService,
    collectionService,
    docsService,
  } = useServices({
    CompatibleFavoriteItemsAdapter,
    WorkspaceDialogService,
    CollectionService,
    DocsService,
  });
  const collectionId = collectionMeta.id;
  const { openConfirmModal } = useConfirmModal();
  const favourite = useLiveData(
    favAdapter.isFavorite$(collectionId, 'collection')
  );

  const { openPromptModal } = usePromptModal();

  const handlePropagation = useCallback((event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleEditName = useCallback(
    (event: MouseEvent) => {
      handlePropagation(event);
      openPromptModal({
        title: t['com.affine.editCollection.renameCollection'](),
        label: t['com.affine.editCollectionName.name'](),
        inputOptions: {
          placeholder: t['com.affine.editCollectionName.name.placeholder'](),
        },
        confirmText: t['com.affine.editCollection.save'](),
        cancelText: t['com.affine.editCollection.button.cancel'](),
        confirmButtonOptions: {
          variant: 'primary',
        },
        onConfirm(name) {
          collectionService.updateCollection(collectionId, {
            name,
          });
        },
      });
    },
    [collectionId, collectionService, handlePropagation, openPromptModal, t]
  );

  const handleEdit = useCallback(
    (event: MouseEvent) => {
      handlePropagation(event);
      workspaceDialogService.open('collection-editor', {
        collectionId: collectionId,
      });
    },
    [handlePropagation, workspaceDialogService, collectionId]
  );

  const handleDelete = useCallback(() => {
    return collectionService.deleteCollection(collectionId);
  }, [collectionId, collectionService]);

  const onToggleFavoriteCollection = useCallback(() => {
    const status = favAdapter.isFavorite(collectionId, 'collection');
    favAdapter.toggle(collectionId, 'collection');
    toast(
      status
        ? t['com.affine.toastMessage.removedFavorites']()
        : t['com.affine.toastMessage.addedFavorites']()
    );
  }, [favAdapter, collectionId, t]);

  const createAndAddDocument = useCallback(() => {
    const newDoc = docsService.createDoc();
    collectionService.addDocToCollection(collectionId, newDoc.id);
  }, [docsService, collectionService, collectionId]);

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
