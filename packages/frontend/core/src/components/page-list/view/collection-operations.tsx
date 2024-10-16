import type { MenuItemProps } from '@affine/component';
import { Menu, MenuItem } from '@affine/component';
import { useDeleteCollectionInfo } from '@affine/core/components/hooks/affine/use-delete-collection-info';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/favorite';
import { WorkbenchService } from '@affine/core/modules/workbench';
import type { Collection } from '@affine/env/filter';
import { useI18n } from '@affine/i18n';
import {
  DeleteIcon,
  EditIcon,
  FilterIcon,
  OpenInNewIcon,
  PlusIcon,
  SplitViewIcon,
} from '@blocksuite/icons/rc';
import {
  FeatureFlagService,
  useLiveData,
  useService,
  useServices,
} from '@toeverything/infra';
import type { PropsWithChildren, ReactElement } from 'react';
import { useCallback, useMemo } from 'react';

import { CollectionService } from '../../../modules/collection';
import { IsFavoriteIcon } from '../../pure/icons';
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
  const {
    collectionService: service,
    workbenchService,
    featureFlagService,
  } = useServices({
    CollectionService,
    WorkbenchService,
    FeatureFlagService,
  });
  const deleteInfo = useDeleteCollectionInfo();
  const workbench = workbenchService.workbench;
  const { open: openEditCollectionModal } = useEditCollection();
  const t = useI18n();
  const { open: openEditCollectionNameModal } = useEditCollectionName({
    title: t['com.affine.editCollection.renameCollection'](),
  });
  const enableMultiView = useLiveData(
    featureFlagService.flags.enable_multi_view.$
  );

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
        icon: <EditIcon />,
        name: t['com.affine.collection.menu.rename'](),
        click: showEditName,
      },
      {
        icon: <FilterIcon />,
        name: t['com.affine.collection.menu.edit'](),
        click: showEdit,
      },
      ...(onAddDocToCollection
        ? [
            {
              icon: <PlusIcon />,
              name: t['New Page'](),
              click: onAddDocToCollection,
            },
          ]
        : []),
      {
        icon: <IsFavoriteIcon favorite={favorite} />,
        name: favorite
          ? t['com.affine.favoritePageOperation.remove']()
          : t['com.affine.favoritePageOperation.add'](),
        click: onToggleFavoritePage,
      },
      {
        icon: <OpenInNewIcon />,
        name: t['com.affine.workbench.tab.page-menu-open'](),
        click: openCollectionNewTab,
      },
      ...(BUILD_CONFIG.isElectron && enableMultiView
        ? [
            {
              icon: <SplitViewIcon />,
              name: t['com.affine.workbench.split-view.page-menu-open'](),
              click: openCollectionSplitView,
            },
          ]
        : []),
      {
        element: <div key="divider" className={styles.divider}></div>,
      },
      {
        icon: <DeleteIcon />,
        name: t['Delete'](),
        click: () => {
          service.deleteCollection(deleteInfo, collection.id);
        },
        type: 'danger',
      },
    ],
    [
      enableMultiView,
      t,
      showEditName,
      showEdit,
      onAddDocToCollection,
      favorite,
      onToggleFavoritePage,
      openCollectionNewTab,
      openCollectionSplitView,
      service,
      deleteInfo,
      collection.id,
    ]
  );
  return (
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
                prefixIcon={action.icon}
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
  );
};
