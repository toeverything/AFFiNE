import { EditCollection } from '@affine/component/page-list';
import type { Collection, Filter } from '@affine/env/filter';
import {
  DeleteIcon,
  FilteredIcon,
  FilterIcon,
  FolderIcon,
  PinIcon,
  ViewLayersIcon,
} from '@blocksuite/icons';
import clsx from 'clsx';
import { useAtom } from 'jotai';
import type { MouseEvent, ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';

import {
  Button,
  MenuItem,
  Modal,
  ModalCloseButton,
  ModalWrapper,
} from '../../..';
import Menu from '../../../ui/menu/menu';
import { appSidebarOpenAtom } from '../../app-sidebar';
import { CreateFilterMenu } from '../filter/vars';
import type { useAllPageSetting } from '../use-all-page-setting';
import * as styles from './collection-list.css';

const CollectionOption = ({
  collection,
  setting,
  updateCollection,
}: {
  collection: Collection;
  setting: ReturnType<typeof useAllPageSetting>;
  updateCollection: (view: Collection) => void;
}) => {
  const actions: {
    icon: ReactNode;
    click: () => void;
    className?: string;
  }[] = useMemo(
    () => [
      {
        icon: <PinIcon />,
        click: () => {
          return setting.updateCollection({
            ...collection,
            pinned: !collection.pinned,
          });
        },
      },
      {
        icon: <FilterIcon />,
        click: () => {
          updateCollection(collection);
        },
      },
      {
        icon: <DeleteIcon style={{ color: 'red' }} />,
        click: () => {
          setting.deleteCollection(collection.id).catch(err => {
            console.error(err);
          });
        },
      },
    ],
    [setting, updateCollection, collection]
  );
  const selectCollection = useCallback(
    () => setting.selectCollection(collection.id),
    [setting, collection.id]
  );
  return (
    <MenuItem
      icon={<ViewLayersIcon></ViewLayersIcon>}
      onClick={selectCollection}
      key={collection.id}
      className={styles.viewMenu}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>{collection.name}</div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {actions.map((v, i) => {
            const onClick = (e: MouseEvent<HTMLDivElement>) => {
              e.stopPropagation();
              v.click();
            };
            return (
              <div
                key={i}
                onClick={onClick}
                style={{ marginLeft: i === 0 ? 28 : undefined }}
                className={clsx(styles.viewOption, v.className)}
              >
                {v.icon}
              </div>
            );
          })}
        </div>
      </div>
    </MenuItem>
  );
};
export const CollectionList = ({
  setting,
}: {
  setting: ReturnType<typeof useAllPageSetting>;
}) => {
  const [open] = useAtom(appSidebarOpenAtom);
  const [collection, setCollection] = useState<Collection>();
  const onChange = useCallback(
    (filterList: Filter[]) => {
      return setting.updateCollection({
        ...setting.currentCollection,
        filterList,
      });
    },
    [setting]
  );
  const closeUpdateCollectionModal = useCallback(
    () => setCollection(undefined),
    []
  );
  const onConfirm = useCallback(
    (view: Collection) => {
      return setting.updateCollection(view).then(() => {
        closeUpdateCollectionModal();
      });
    },
    [closeUpdateCollectionModal, setting]
  );
  return (
    <div
      className={clsx({
        [styles.filterButtonCollapse]: !open,
      })}
      style={{ marginLeft: 4, display: 'flex', alignItems: 'center' }}
    >
      {setting.savedCollections.length > 0 && (
        <Menu
          trigger="click"
          content={
            <div style={{ minWidth: 150 }}>
              <MenuItem
                icon={<FolderIcon></FolderIcon>}
                onClick={setting.backToAll}
                className={styles.viewMenu}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>All</div>
                </div>
              </MenuItem>
              <div className={styles.menuTitleStyle}>Saved Collection</div>
              <div className={styles.menuDividerStyle}></div>
              {setting.savedCollections.map(view => (
                <CollectionOption
                  key={view.id}
                  collection={view}
                  setting={setting}
                  updateCollection={setCollection}
                />
              ))}
            </div>
          }
        >
          <Button
            size="small"
            className={clsx(styles.viewButton)}
            hoverColor="var(--affine-icon-color)"
          >
            {setting.currentCollection.name}
          </Button>
        </Menu>
      )}
      <Menu
        trigger="click"
        placement="bottom-start"
        content={
          <CreateFilterMenu
            value={setting.currentCollection.filterList}
            onChange={onChange}
          />
        }
      >
        <Button
          icon={<FilteredIcon />}
          className={clsx(styles.filterButton)}
          size="small"
          hoverColor="var(--affine-icon-color)"
        >
          Filter
        </Button>
      </Menu>
      <Modal open={collection != null} onClose={closeUpdateCollectionModal}>
        <ModalWrapper
          width={560}
          style={{
            padding: '40px',
            background: 'var(--affine-background-primary-color)',
          }}
        >
          <ModalCloseButton
            top={12}
            right={12}
            onClick={closeUpdateCollectionModal}
            hoverColor="var(--affine-icon-color)"
          />
          {collection ? (
            <EditCollection
              title="Update Collection"
              init={collection}
              onConfirmText="Save"
              onCancel={closeUpdateCollectionModal}
              onConfirm={onConfirm}
            />
          ) : null}
        </ModalWrapper>
      </Modal>
    </div>
  );
};
