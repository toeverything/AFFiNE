import {
  Menu,
  MenuIcon,
  MenuItem,
  type MenuItemProps,
} from '@affine/component';
import type { Collection, DeleteCollectionInfo } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { DeleteIcon, EditIcon, FilterIcon } from '@blocksuite/icons';
import {
  type PropsWithChildren,
  type ReactElement,
  useCallback,
  useMemo,
} from 'react';

import type { useCollectionManager } from '../use-collection-manager';
import * as styles from './collection-operations.css';
import type { AllPageListConfig } from './index';
import {
  useEditCollection,
  useEditCollectionName,
} from './use-edit-collection';

export const CollectionOperations = ({
  collection,
  config,
  setting,
  info,
  openRenameModal,
  children,
}: PropsWithChildren<{
  info: DeleteCollectionInfo;
  collection: Collection;
  config: AllPageListConfig;
  setting: ReturnType<typeof useCollectionManager>;
  openRenameModal?: () => void;
}>) => {
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
        return setting.updateCollection({ ...collection, name });
      })
      .catch(err => {
        console.error(err);
      });
  }, [openRenameModal, openEditCollectionNameModal, collection, setting]);

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
          setting.deleteCollection(info, collection.id);
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
