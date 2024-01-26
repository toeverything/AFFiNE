import {
  ConfirmModal,
  IconButton,
  Menu,
  MenuIcon,
  MenuItem,
  Tooltip,
} from '@affine/component';
import type { Collection, DeleteCollectionInfo } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  DeleteIcon,
  DeletePermanentlyIcon,
  EditIcon,
  FavoritedIcon,
  FavoriteIcon,
  FilterIcon,
  MoreVerticalIcon,
  OpenInNewIcon,
  ResetIcon,
} from '@blocksuite/icons';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

import { FavoriteTag } from './components/favorite-tag';
import * as styles from './list.css';
import { DisablePublicSharing, MoveToTrash } from './operation-menu-items';
import type { useCollectionManager } from './use-collection-manager';
import { ColWrapper, stopPropagationWithoutPrevent } from './utils';
import {
  type AllPageListConfig,
  useEditCollection,
  useEditCollectionName,
} from './view';

export interface PageOperationCellProps {
  favorite: boolean;
  isPublic: boolean;
  link: string;
  onToggleFavoritePage: () => void;
  onRemoveToTrash: () => void;
  onDisablePublicSharing: () => void;
}

export const PageOperationCell = ({
  favorite,
  isPublic,
  link,
  onToggleFavoritePage,
  onRemoveToTrash,
  onDisablePublicSharing,
}: PageOperationCellProps) => {
  const t = useAFFiNEI18N();
  const [openDisableShared, setOpenDisableShared] = useState(false);
  const OperationMenu = (
    <>
      {isPublic && (
        <DisablePublicSharing
          data-testid="disable-public-sharing"
          onSelect={() => {
            setOpenDisableShared(true);
          }}
        />
      )}
      <MenuItem
        onClick={onToggleFavoritePage}
        preFix={
          <MenuIcon>
            {favorite ? (
              <FavoritedIcon style={{ color: 'var(--affine-primary-color)' }} />
            ) : (
              <FavoriteIcon />
            )}
          </MenuIcon>
        }
      >
        {favorite
          ? t['com.affine.favoritePageOperation.remove']()
          : t['com.affine.favoritePageOperation.add']()}
      </MenuItem>
      {!environment.isDesktop && (
        <Link
          className={styles.clearLinkStyle}
          onClick={stopPropagationWithoutPrevent}
          to={link}
          target={'_blank'}
          rel="noopener noreferrer"
        >
          <MenuItem
            style={{ marginBottom: 4 }}
            preFix={
              <MenuIcon>
                <OpenInNewIcon />
              </MenuIcon>
            }
          >
            {t['com.affine.openPageOperation.newTab']()}
          </MenuItem>
        </Link>
      )}
      <MoveToTrash data-testid="move-to-trash" onSelect={onRemoveToTrash} />
    </>
  );
  return (
    <>
      <ColWrapper
        hideInSmallContainer
        data-testid="page-list-item-favorite"
        data-favorite={favorite ? true : undefined}
        className={styles.favoriteCell}
      >
        <FavoriteTag onClick={onToggleFavoritePage} active={favorite} />
      </ColWrapper>
      <ColWrapper alignment="start">
        <Menu
          items={OperationMenu}
          contentOptions={{
            align: 'end',
          }}
        >
          <IconButton type="plain" data-testid="page-list-operation-button">
            <MoreVerticalIcon />
          </IconButton>
        </Menu>
      </ColWrapper>
      <DisablePublicSharing.DisablePublicSharingModal
        onConfirm={onDisablePublicSharing}
        open={openDisableShared}
        onOpenChange={setOpenDisableShared}
      />
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
  const t = useAFFiNEI18N();
  const [open, setOpen] = useState(false);
  return (
    <ColWrapper flex={1}>
      <Tooltip content={t['com.affine.trashOperation.restoreIt']()} side="top">
        <IconButton
          data-testid="restore-page-button"
          style={{ marginRight: '12px' }}
          onClick={() => {
            onRestorePage();
          }}
        >
          <ResetIcon />
        </IconButton>
      </Tooltip>
      <Tooltip
        content={t['com.affine.trashOperation.deletePermanently']()}
        side="top"
        align="end"
      >
        <IconButton
          data-testid="delete-page-button"
          onClick={() => {
            setOpen(true);
          }}
        >
          <DeletePermanentlyIcon />
        </IconButton>
      </Tooltip>
      <ConfirmModal
        title={`${t['com.affine.trashOperation.deletePermanently']()}?`}
        description={t['com.affine.trashOperation.deleteDescription']()}
        cancelText={t['com.affine.confirmModal.button.cancel']()}
        confirmButtonOptions={{
          type: 'error',
          children: t['com.affine.trashOperation.delete'](),
        }}
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => {
          onPermanentlyDeletePage();
          setOpen(false);
        }}
      />
    </ColWrapper>
  );
};

export interface CollectionOperationCellProps {
  collection: Collection;
  info: DeleteCollectionInfo;
  config: AllPageListConfig;
  setting: ReturnType<typeof useCollectionManager>;
}

export const CollectionOperationCell = ({
  collection,
  config,
  setting,
  info,
}: CollectionOperationCellProps) => {
  const t = useAFFiNEI18N();

  const { open: openEditCollectionModal, node: editModal } =
    useEditCollection(config);

  const { open: openEditCollectionNameModal, node: editNameModal } =
    useEditCollectionName({
      title: t['com.affine.editCollection.renameCollection'](),
    });

  const handleEditName = useCallback(() => {
    // use openRenameModal if it is in the sidebar collection list
    openEditCollectionNameModal(collection.name)
      .then(name => {
        return setting.updateCollection({ ...collection, name });
      })
      .catch(err => {
        console.error(err);
      });
  }, [collection, openEditCollectionNameModal, setting]);

  const handleEdit = useCallback(() => {
    openEditCollectionModal(collection)
      .then(collection => {
        return setting.updateCollection(collection);
      })
      .catch(err => {
        console.error(err);
      });
  }, [setting, collection, openEditCollectionModal]);

  const handleDelete = useCallback(() => {
    return setting.deleteCollection(info, collection.id);
  }, [setting, info, collection]);

  return (
    <>
      {editModal}
      {editNameModal}
      <Tooltip content={t['com.affine.collection.menu.rename']()} side="top">
        <IconButton onClick={handleEditName}>
          <EditIcon />
        </IconButton>
      </Tooltip>
      <Tooltip content={t['com.affine.collection.menu.edit']()} side="top">
        <IconButton onClick={handleEdit}>
          <FilterIcon />
        </IconButton>
      </Tooltip>

      <ColWrapper alignment="start">
        <Menu
          items={
            <MenuItem
              onClick={handleDelete}
              preFix={
                <MenuIcon>
                  <DeleteIcon />
                </MenuIcon>
              }
              type="danger"
            >
              {t['Delete']()}
            </MenuItem>
          }
          contentOptions={{
            align: 'end',
          }}
        >
          <IconButton type="plain">
            <MoreVerticalIcon />
          </IconButton>
        </Menu>
      </ColWrapper>
    </>
  );
};
