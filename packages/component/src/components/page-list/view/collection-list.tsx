import { EditCollectionModel } from '@affine/component/page-list';
import type { Collection, Filter } from '@affine/env/filter';
import type { PropertiesMeta } from '@affine/env/filter';
import type { GetPageInfoById } from '@affine/env/page-info';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
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

import { Button, MenuItem, Tooltip } from '../../..';
import Menu from '../../../ui/menu/menu';
import { appSidebarOpenAtom } from '../../app-sidebar';
import { CreateFilterMenu } from '../filter/vars';
import type { useCollectionManager } from '../use-collection-manager';
import * as styles from './collection-list.css';

const CollectionOption = ({
  collection,
  setting,
  updateCollection,
}: {
  collection: Collection;
  setting: ReturnType<typeof useCollectionManager>;
  updateCollection: (view: Collection) => void;
}) => {
  const actions: {
    icon: ReactNode;
    click: () => void;
    className?: string;
    name: string;
  }[] = useMemo(
    () => [
      {
        icon: <PinIcon />,
        name: 'pin',
        click: () => {
          return setting.updateCollection({
            ...collection,
            pinned: !collection.pinned,
          });
        },
      },
      {
        icon: <FilterIcon />,
        name: 'edit',
        click: () => {
          updateCollection(collection);
        },
      },
      {
        icon: <DeleteIcon style={{ color: 'var(--affine-error-color)' }} />,
        name: 'delete',
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
      data-testid="collection-select-option"
      icon={<ViewLayersIcon></ViewLayersIcon>}
      onClick={selectCollection}
      key={collection.id}
      className={styles.viewMenu}
    >
      <Tooltip
        content={collection.name}
        placement="right"
        pointerEnterDelay={1500}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              maxWidth: '150px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {collection.name}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {actions.map((v, i) => {
              const onClick = (e: MouseEvent<HTMLDivElement>) => {
                e.stopPropagation();
                v.click();
              };
              return (
                <div
                  data-testid={`collection-select-option-${v.name}`}
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
      </Tooltip>
    </MenuItem>
  );
};
export const CollectionList = ({
  setting,
  getPageInfo,
  propertiesMeta,
}: {
  setting: ReturnType<typeof useCollectionManager>;
  getPageInfo: GetPageInfoById;
  propertiesMeta: PropertiesMeta;
}) => {
  const t = useAFFiNEI18N();
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
      style={{
        display: 'flex',
        alignItems: 'center',
      }}
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
            className={clsx(styles.viewButton)}
            data-testid="collection-select"
          >
            <Tooltip
              content={setting.currentCollection.name}
              pointerEnterDelay={1500}
            >
              <>{setting.currentCollection.name}</>
            </Tooltip>
          </Button>
        </Menu>
      )}
      <Menu
        trigger="click"
        placement="bottom-start"
        content={
          <CreateFilterMenu
            propertiesMeta={propertiesMeta}
            value={setting.currentCollection.filterList}
            onChange={onChange}
          />
        }
      >
        <Button
          icon={<FilteredIcon />}
          className={clsx(styles.filterButton)}
          data-testid="create-first-filter"
        >
          {t['com.affine.filter']()}
        </Button>
      </Menu>
      <EditCollectionModel
        propertiesMeta={propertiesMeta}
        getPageInfo={getPageInfo}
        init={collection}
        open={!!collection}
        onClose={closeUpdateCollectionModal}
        onConfirm={onConfirm}
      ></EditCollectionModel>
    </div>
  );
};
