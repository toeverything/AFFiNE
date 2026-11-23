import {
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
} from '@affine/component';
import { AddFilterMenu } from '@affine/core/components/filter/add-filter';
import {
  CollectionService,
  type PinnedCollectionRecord,
  PinnedCollectionService,
} from '@affine/core/modules/collection';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import {
  CloseIcon,
  CollectionsIcon,
  EditIcon,
  FilterIcon,
  PlusIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useMemo, useState } from 'react';

import * as styles from './pinned-collections.css';

export const PinnedCollectionItem = ({
  record,
  isActive,
  onClick,
  onClickRemove,
}: {
  record: PinnedCollectionRecord;
  onClickRemove: () => void;
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
      <span className={styles.itemContent}>{name ?? t['Untitled']()}</span>
      {isActive && (
        <IconButton
          className={styles.closeButton}
          size="16"
          onClick={e => {
            e.stopPropagation();
            onClickRemove();
          }}
        >
          <CloseIcon />
        </IconButton>
      )}
    </div>
  );
};

export const PinnedCollections = ({
  activeCollectionId,
  onActiveAll,
  onActiveCollection,
  onAddFilter,
  hiddenAdd,
}: {
  activeCollectionId: string | null;
  onActiveAll: () => void;
  onActiveCollection: (collectionId: string) => void;
  onAddFilter: (params: FilterParams) => void;
  hiddenAdd?: boolean;
}) => {
  const t = useI18n();
  const workspaceDialogService = useService(WorkspaceDialogService);
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
        onClick={() => {
          // only fire onActiveAll if the collection is not already active
          if (activeCollectionId !== null) {
            track.allDocs.header.navigation.navigatePinedCollectionRouter({
              control: 'all',
            });
            onActiveAll();
          }
        }}
        role="button"
      >
        {t['com.affine.all-docs.pinned-collection.all']()}
      </div>
      {pinnedCollections.map((record, index) => (
        <PinnedCollectionItem
          key={record.collectionId}
          record={record}
          isActive={activeCollectionId === record.collectionId}
          onClick={() => {
            // only fire onActiveCollection if the collection is not already active
            if (activeCollectionId !== record.collectionId) {
              track.allDocs.header.navigation.navigatePinedCollectionRouter({
                control: 'user-custom-collection',
              });
              onActiveCollection(record.collectionId);
            }
          }}
          onClickRemove={() => {
            const nextCollectionId = pinnedCollections[index - 1]?.collectionId;
            if (nextCollectionId) {
              onActiveCollection(nextCollectionId);
            } else {
              onActiveAll();
            }
            pinnedCollectionService.removePinnedCollection(record.collectionId);
          }}
        />
      ))}
      {!hiddenAdd && (
        <AddPinnedCollection
          onPinCollection={handleAddPinnedCollection}
          onAddFilter={onAddFilter}
        />
      )}
      <div style={{ flex: 1 }}></div>
      {activeCollectionId && (
        <Tooltip content={t['com.affine.all-docs.pinned-collection.edit']()}>
          <IconButton
            size="16"
            className={styles.editIconButton}
            onClick={() => {
              track.allDocs.header.collection.editCollection();
              workspaceDialogService.open('collection-editor', {
                collectionId: activeCollectionId,
              });
            }}
          >
            <EditIcon />
          </IconButton>
        </Tooltip>
      )}
    </div>
  );
};

export const AddPinnedCollection = ({
  onPinCollection,
  onAddFilter,
}: {
  onPinCollection: (collectionId: string) => void;
  onAddFilter: (params: FilterParams) => void;
}) => {
  return (
    <Menu
      items={
        <AddPinnedCollectionMenuContent
          onPinCollection={onPinCollection}
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
  onPinCollection,
  onAddFilter,
}: {
  onPinCollection: (collectionId: string) => void;
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
            track.allDocs.header.collection.addPinnedCollection();
            onPinCollection(meta.id);
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
