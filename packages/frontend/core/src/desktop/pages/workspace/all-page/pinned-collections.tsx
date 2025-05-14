import { Divider, IconButton, Menu, MenuItem } from '@affine/component';
import { AddFilterMenu } from '@affine/core/components/filter/add-filter';
import {
  CollectionService,
  type PinnedCollectionRecord,
  PinnedCollectionService,
} from '@affine/core/modules/collection';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { useI18n } from '@affine/i18n';
import { CollectionsIcon, FilterIcon, PlusIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useMemo, useState } from 'react';

import * as styles from './pinned-collections.css';

export const PinnedCollectionItem = ({
  record,
  isActive,
  onClick,
}: {
  record: PinnedCollectionRecord;
  isActive: boolean;
  onClick: () => void;
}) => {
  const t = useI18n();
  const collectionService = useService(CollectionService);
  const collection = useLiveData(
    collectionService.collection$(record.collectionId)
  );
  const name = useLiveData(collection?.name$);
  if (!collection) {
    return null;
  }
  return (
    <div
      className={styles.item}
      role="button"
      data-active={isActive ? 'true' : undefined}
      onClick={onClick}
    >
      {name ?? t['Untitled']()}
    </div>
  );
};

export const PinnedCollections = ({
  activeCollectionId,
  onClickAll,
  onClickCollection,
  onAddFilter,
  hiddenAdd,
}: {
  activeCollectionId: string | null;
  onClickAll: () => void;
  onClickCollection: (collectionId: string) => void;
  onAddFilter: (params: FilterParams) => void;
  hiddenAdd?: boolean;
}) => {
  const t = useI18n();
  const pinnedCollectionService = useService(PinnedCollectionService);
  const pinnedCollections = useLiveData(
    pinnedCollectionService.sortedPinnedCollections$
  );

  const handleAddPinnedCollection = (collectionId: string) => {
    pinnedCollectionService.addPinnedCollection({
      collectionId,
      index: pinnedCollectionService.indexAt('after'),
    });
  };

  return (
    <div className={styles.container}>
      <div
        className={styles.item}
        data-active={activeCollectionId === null ? 'true' : undefined}
        onClick={onClickAll}
        role="button"
      >
        {t['com.affine.all-docs.pinned-collection.all']()}
      </div>
      {pinnedCollections.map(record => (
        <PinnedCollectionItem
          key={record.collectionId}
          record={record}
          isActive={activeCollectionId === record.collectionId}
          onClick={() => onClickCollection(record.collectionId)}
        />
      ))}
      {!hiddenAdd && (
        <AddPinnedCollection
          onAddPinnedCollection={handleAddPinnedCollection}
          onAddFilter={onAddFilter}
        />
      )}
    </div>
  );
};

export const AddPinnedCollection = ({
  onAddPinnedCollection,
  onAddFilter,
}: {
  onAddPinnedCollection: (collectionId: string) => void;
  onAddFilter: (params: FilterParams) => void;
}) => {
  return (
    <Menu
      items={
        <AddPinnedCollectionMenuContent
          onAddPinnedCollection={onAddPinnedCollection}
          onAddFilter={onAddFilter}
        />
      }
    >
      <IconButton size="16">
        <PlusIcon />
      </IconButton>
    </Menu>
  );
};

export const AddPinnedCollectionMenuContent = ({
  onAddPinnedCollection,
  onAddFilter,
}: {
  onAddPinnedCollection: (collectionId: string) => void;
  onAddFilter: (params: FilterParams) => void;
}) => {
  const [addingFilter, setAddingFilter] = useState<boolean>(false);
  const collectionService = useService(CollectionService);
  const collectionMetas = useLiveData(collectionService.collectionMetas$);
  const pinnedCollectionService = useService(PinnedCollectionService);
  const pinnedCollections = useLiveData(
    pinnedCollectionService.pinnedCollections$
  );

  const unpinnedCollectionMetas = useMemo(
    () =>
      collectionMetas.filter(
        meta =>
          !pinnedCollections.some(
            collection => collection.collectionId === meta.id
          )
      ),
    [pinnedCollections, collectionMetas]
  );

  const t = useI18n();

  return !addingFilter ? (
    <>
      <MenuItem
        prefixIcon={<FilterIcon />}
        onClick={e => {
          // prevent default to avoid closing the menu
          e.preventDefault();
          setAddingFilter(true);
        }}
      >
        {t['com.affine.filter']()}
      </MenuItem>
      {unpinnedCollectionMetas.length > 0 && <Divider />}
      {unpinnedCollectionMetas.map(meta => (
        <MenuItem
          key={meta.id}
          prefixIcon={<CollectionsIcon />}
          suffixIcon={<PlusIcon />}
          onClick={() => {
            onAddPinnedCollection(meta.id);
          }}
        >
          {meta.name ?? t['Untitled']()}
        </MenuItem>
      ))}
    </>
  ) : (
    <AddFilterMenu onBack={() => setAddingFilter(false)} onAdd={onAddFilter} />
  );
};
