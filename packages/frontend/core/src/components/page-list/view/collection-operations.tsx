import type { MenuItemProps } from '@affine/component';
import { Menu, MenuIcon, MenuItem } from '@affine/component';
import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { useDeleteCollectionInfo } from '@affine/core/hooks/affine/use-delete-collection-info';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/properties';
import { WorkbenchService } from '@affine/core/modules/workbench';
import type { Collection } from '@affine/env/filter';
import { useI18n } from '@affine/i18n';
import {
  DeleteIcon,
  EditIcon,
  FavoritedIcon,
  FavoriteIcon,
  FilterIcon,
  OpenInNewIcon,
  PlusIcon,
  SplitViewIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import type { PropsWithChildren, ReactElement } from 'react';
import { useCallback, useMemo } from 'react';

import { CollectionService } from '../../../modules/collection';
import * as styles from './collection-operations.css';
import {
  useEditCollection,
  useEditCollectionName,
} from './use-edit-collection';

export const CollectionOperations = ({
  collection,
  openRenameModal,
  onAddDocToCollection,
  children,
}: PropsWithChildren<{
  collection: Collection;
  openRenameModal?: () => void;
  onAddDocToCollection?: () => void;
}>) => {
  const deleteInfo = useDeleteCollectionInfo();
  const { appSettings } = useAppSettingHelper();
  const service = useService(CollectionService);
  const workbench = useService(WorkbenchService).workbench;
  const { open: openEditCollectionModal, node: editModal } =
    useEditCollection();
  const t = useI18n();
  const { open: openEditCollectionNameModal, node: editNameModal } =
    useEditCollectionName({
      title: t['com.affine.editCollection.renameCollection'](),
    });

  const showEditName = useCallback(() => {
    // use openRenameModal if it is in the sidebar collection list
    if (openRenameModal) {
      return openRenameModal();
    }
    openEditCollectionNameModal(collection.name)
      .then(name => {
        return service.updateCollection(collection.id, () => ({
          ...collection,
          name,
        }));
      })
      .catch(err => {
        console.error(err);
      });
  }, [openRenameModal, openEditCollectionNameModal, collection, service]);

  const showEdit = useCallback(() => {
    openEditCollectionModal(collection)
      .then(collection => {
        return service.updateCollection(collection.id, () => collection);
      })
      .catch(err => {
        console.error(err);
      });
  }, [openEditCollectionModal, collection, service]);

  const openCollectionSplitView = useCallback(() => {
    workbench.openCollection(collection.id, { at: 'tail' });
  }, [collection.id, workbench]);

  const openCollectionNewTab = useCallback(() => {
    workbench.openCollection(collection.id, { at: 'new-tab' });
  }, [collection.id, workbench]);

  const favAdapter = useService(CompatibleFavoriteItemsAdapter);

  const onToggleFavoritePage = useCallback(() => {
    favAdapter.toggle(collection.id, 'collection');
  }, [favAdapter, collection.id]);

  const favorite = useLiveData(
    useMemo(
      () => favAdapter.isFavorite$(collection.id, 'collection'),
      [collection.id, favAdapter]
    )
  );

  const actions = useMemo<
    Array<
      | {
          icon: ReactElement;
          name: string;
          click: () => void;
          type?: MenuItemProps['type'];
          element?: undefined;
        }
      | {
          element: ReactElement;
        }
    >
  >(
    () => [
      {
        icon: (
          <MenuIcon>
            <EditIcon />
          </MenuIcon>
        ),
        name: t['com.affine.collection.menu.rename'](),
        click: showEditName,
      },
      {
        icon: (
          <MenuIcon>
            <FilterIcon />
          </MenuIcon>
        ),
        name: t['com.affine.collection.menu.edit'](),
        click: showEdit,
      },
      ...(onAddDocToCollection
        ? [
            {
              icon: (
                <MenuIcon>
                  <PlusIcon />
                </MenuIcon>
              ),
              name: t['New Page'](),
              click: onAddDocToCollection,
            },
          ]
        : []),
      {
        icon: (
          <MenuIcon>
            {favorite ? (
              <FavoritedIcon style={{ color: 'var(--affine-primary-color)' }} />
            ) : (
              <FavoriteIcon />
            )}
          </MenuIcon>
        ),
        name: favorite
          ? t['com.affine.favoritePageOperation.remove']()
          : t['com.affine.favoritePageOperation.add'](),
        click: onToggleFavoritePage,
      },
      {
        icon: (
          <MenuIcon>
            <OpenInNewIcon />
          </MenuIcon>
        ),
        name: t['com.affine.workbench.tab.page-menu-open'](),
        click: openCollectionNewTab,
      },
      ...(appSettings.enableMultiView
        ? [
            {
              icon: (
                <MenuIcon>
                  <SplitViewIcon />
                </MenuIcon>
              ),
              name: t['com.affine.workbench.split-view.page-menu-open'](),
              click: openCollectionSplitView,
            },
          ]
        : []),
      {
        element: <div key="divider" className={styles.divider}></div>,
      },
      {
        icon: (
          <MenuIcon>
            <DeleteIcon />
          </MenuIcon>
        ),
        name: t['Delete'](),
        click: () => {
          service.deleteCollection(deleteInfo, collection.id);
        },
        type: 'danger',
      },
    ],
    [
      t,
      showEditName,
      showEdit,
      onAddDocToCollection,
      favorite,
      onToggleFavoritePage,
      openCollectionNewTab,
      appSettings.enableMultiView,
      openCollectionSplitView,
      service,
      deleteInfo,
      collection.id,
    ]
  );
  return (
    <>
      {editModal}
      {editNameModal}
      <Menu
        items={
          <div style={{ minWidth: 150 }}>
            {actions.map(action => {
              if (action.element) {
                return action.element;
              }
              return (
                <MenuItem
                  data-testid="collection-option"
                  key={action.name}
                  type={action.type}
                  preFix={action.icon}
                  onClick={action.click}
                >
                  {action.name}
                </MenuItem>
              );
            })}
          </div>
        }
      >
        {children}
      </Menu>
    </>
  );
};
