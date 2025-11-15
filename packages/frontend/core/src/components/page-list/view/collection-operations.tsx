import type { MenuItemProps } from '@affine/component';
import { Menu, MenuItem, usePromptModal } from '@affine/component';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/favorite';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import {
  DeleteIcon,
  EditIcon,
  FilterIcon,
  OpenInNewIcon,
  PlusIcon,
  SplitViewIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService, useServices } from '@toeverything/infra';
import type { PropsWithChildren, ReactElement } from 'react';
import { useCallback, useMemo } from 'react';

import {
  type Collection,
  CollectionService,
} from '../../../modules/collection';
import { IsFavoriteIcon } from '../../pure/icons';
import * as styles from './collection-operations.css';

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
    workspaceDialogService,
  } = useServices({
    CollectionService,
    WorkbenchService,
    WorkspaceDialogService,
  });
  const workbench = workbenchService.workbench;
  const t = useI18n();
  const { openPromptModal } = usePromptModal();

  const showEditName = useCallback(() => {
    // use openRenameModal if it is in the sidebar collection list
    if (openRenameModal) {
      return openRenameModal();
    }
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
        service.updateCollection(collection.id, {
          name,
        });
      },
    });
  }, [openRenameModal, openPromptModal, t, service, collection]);

  const showEdit = useCallback(() => {
    track.collection.collection.$.editCollection();
    workspaceDialogService.open('collection-editor', {
      collectionId: collection.id,
    });
  }, [workspaceDialogService, collection.id]);

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
      ...(BUILD_CONFIG.isElectron
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
          service.deleteCollection(collection.id);
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
      openCollectionSplitView,
      service,
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
