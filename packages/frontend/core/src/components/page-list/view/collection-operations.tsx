import {
  Menu,
  MenuIcon,
  MenuItem,
  type MenuItemProps,
} from '@affine/component';
import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { Workbench } from '@affine/core/modules/workbench';
import type { Collection, DeleteCollectionInfo } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  DeleteIcon,
  EditIcon,
  FilterIcon,
  SplitViewIcon,
} from '@blocksuite/icons';
import { useService } from '@toeverything/infra/di';
import {
  type PropsWithChildren,
  type ReactElement,
  useCallback,
  useMemo,
} from 'react';

import { CollectionService } from '../../../modules/collection';
import * as styles from './collection-operations.css';
import type { AllPageListConfig } from './index';
import {
  useEditCollection,
  useEditCollectionName,
} from './use-edit-collection';

export const CollectionOperations = ({
  collection,
  config,
  info,
  openRenameModal,
  children,
}: PropsWithChildren<{
  info: DeleteCollectionInfo;
  collection: Collection;
  config: AllPageListConfig;
  openRenameModal?: () => void;
}>) => {
  const { appSettings } = useAppSettingHelper();
  const service = useService(CollectionService);
  const workbench = useService(Workbench);
  const { open: openEditCollectionModal, node: editModal } =
    useEditCollection(config);
  const t = useAFFiNEI18N();
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
          service.deleteCollection(info, collection.id);
        },
        type: 'danger',
      },
    ],
    [
      t,
      showEditName,
      showEdit,
      appSettings.enableMultiView,
      openCollectionSplitView,
      service,
      info,
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
