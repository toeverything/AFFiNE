import type { Collection, DeleteCollectionInfo } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { DeleteIcon, EditIcon, FilterIcon } from '@blocksuite/icons';
import {
  Menu,
  MenuIcon,
  MenuItem,
  type MenuItemProps,
} from '@toeverything/components/menu';
import {
  type PropsWithChildren,
  type ReactElement,
  useCallback,
  useMemo,
} from 'react';

import type { useCollectionManager } from '../use-collection-manager';
import type { AllPageListConfig } from '.';
import * as styles from './collection-operations.css';
import {
  useEditCollection,
  useEditCollectionName,
} from './use-edit-collection';

export const CollectionOperations = ({
  collection,
  config,
  setting,
  info,
  children,
}: PropsWithChildren<{
  info: DeleteCollectionInfo;
  collection: Collection;
  config: AllPageListConfig;
  setting: ReturnType<typeof useCollectionManager>;
}>) => {
  const { open: openEditCollectionModal, node: editModal } =
    useEditCollection(config);
  const t = useAFFiNEI18N();
  const { open: openEditCollectionNameModal, node: editNameModal } =
    useEditCollectionName({
      title: t['com.affine.editCollection.renameCollection'](),
    });
  const showEditName = useCallback(() => {
    openEditCollectionNameModal(collection.name)
      .then(name => {
        return setting.updateCollection({ ...collection, name });
      })
      .catch(err => {
        console.error(err);
      });
  }, [openEditCollectionNameModal, collection, setting]);
  const showEdit = useCallback(() => {
    openEditCollectionModal(collection)
      .then(collection => {
        return setting.updateCollection(collection);
      })
      .catch(err => {
        console.error(err);
      });
  }, [setting, collection, openEditCollectionModal]);
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
          setting.deleteCollection(info, collection.id).catch(err => {
            console.error(err);
          });
        },
        type: 'danger',
      },
    ],
    [t, showEditName, showEdit, setting, info, collection.id]
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
