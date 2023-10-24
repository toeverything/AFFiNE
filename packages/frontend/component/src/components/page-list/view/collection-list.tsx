import type {
  Collection,
  DeleteCollectionInfo,
  Filter,
} from '@affine/env/filter';
import type { PropertiesMeta } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { FilteredIcon, FolderIcon, ViewLayersIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { Menu, MenuIcon, MenuItem } from '@toeverything/components/menu';
import { Tooltip } from '@toeverything/components/tooltip';
import clsx from 'clsx';
import type { MouseEvent } from 'react';
import { useCallback, useState } from 'react';

import { FlexWrapper } from '../../../ui/layout';
import { CreateFilterMenu } from '../filter/vars';
import type { useCollectionManager } from '../use-collection-manager';
import * as styles from './collection-list.css';
import { type AllPageListConfig, EditCollectionModal } from './edit-collection';
import { useActions } from './use-action';

const CollectionOption = ({
  collection,
  setting,
  updateCollection,
  jumpToCollection,
  info,
}: {
  collection: Collection;
  info: DeleteCollectionInfo;
  setting: ReturnType<typeof useCollectionManager>;
  updateCollection: (view: Collection) => void;
  jumpToCollection: (id: string) => void;
}) => {
  const actions = useActions({
    collection,
    setting,
    info,
    openEdit: updateCollection,
  });
  const jump = useCallback(() => {
    jumpToCollection(collection.id);
  }, [collection.id, jumpToCollection]);
  return (
    <MenuItem
      data-testid="collection-select-option"
      preFix={
        <MenuIcon>
          <ViewLayersIcon />
        </MenuIcon>
      }
      onClick={jump}
      key={collection.id}
      className={styles.viewMenu}
    >
      <Tooltip
        content={collection.name}
        side="right"
        rootOptions={{
          delayDuration: 1500,
        }}
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
            {actions.map((action, i) => {
              const onClick = (e: MouseEvent<HTMLDivElement>) => {
                e.stopPropagation();
                action.click();
              };

              return (
                <div
                  data-testid={`collection-select-option-${action.name}`}
                  key={i}
                  onClick={onClick}
                  style={{ marginLeft: i === 0 ? 28 : undefined }}
                  className={clsx(styles.viewOption, action.className)}
                >
                  {action.icon}
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
  propertiesMeta,
  backToAll,
  jumpToCollection,
  allPageListConfig,
  info,
}: {
  setting: ReturnType<typeof useCollectionManager>;
  propertiesMeta: PropertiesMeta;
  backToAll: () => void;
  jumpToCollection: (id: string) => void;
  allPageListConfig: AllPageListConfig;
  info: DeleteCollectionInfo;
}) => {
  const t = useAFFiNEI18N();
  const [collection, setCollection] = useState<Collection>();
  const onChange = useCallback(
    (filterList: Filter[]) => {
      setting
        .updateCollection({
          ...setting.currentCollection,
          filterList,
        })
        .catch(err => {
          console.error(err);
        });
    },
    [setting]
  );
  const closeUpdateCollectionModal = useCallback((open: boolean) => {
    if (!open) {
      setCollection(undefined);
    }
  }, []);

  const onConfirm = useCallback(
    async (view: Collection) => {
      await setting.updateCollection(view);
      closeUpdateCollectionModal(false);
    },
    [closeUpdateCollectionModal, setting]
  );
  return (
    <FlexWrapper alignItems="center">
      {setting.savedCollections.length > 0 && (
        <Menu
          items={
            <div style={{ minWidth: 150 }}>
              <MenuItem
                preFix={
                  <MenuIcon>
                    <FolderIcon />
                  </MenuIcon>
                }
                onClick={backToAll}
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
                  info={info}
                  key={view.id}
                  collection={view}
                  setting={setting}
                  updateCollection={setCollection}
                  jumpToCollection={jumpToCollection}
                />
              ))}
            </div>
          }
        >
          <Button
            data-testid="collection-select"
            style={{ marginRight: '20px' }}
          >
            <Tooltip
              content={setting.currentCollection.name}
              rootOptions={{
                delayDuration: 1500,
              }}
            >
              <>{setting.currentCollection.name}</>
            </Tooltip>
          </Button>
        </Menu>
      )}
      {setting.isDefault ? (
        <Menu
          items={
            <CreateFilterMenu
              propertiesMeta={propertiesMeta}
              value={setting.currentCollection.filterList}
              onChange={onChange}
            />
          }
        >
          <Button
            className={styles.filterMenuTrigger}
            type="default"
            icon={<FilteredIcon />}
            data-testid="create-first-filter"
          >
            {t['com.affine.filter']()}
          </Button>
        </Menu>
      ) : null}
      <EditCollectionModal
        allPageListConfig={allPageListConfig}
        init={collection}
        open={!!collection}
        onOpenChange={closeUpdateCollectionModal}
        onConfirm={onConfirm}
      />
    </FlexWrapper>
  );
};
