import { WorkspaceService } from '@affine/core/modules/workspace';
import { Trans } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  type CollectionMeta,
  CollectionService,
} from '../../../modules/collection';
import { ListFloatingToolbar } from '../components/list-floating-toolbar';
import { collectionHeaderColsDef } from '../header-col-def';
import { CollectionOperationCell } from '../operation-cell';
import { CollectionListItemRenderer } from '../page-group';
import { ListTableHeader } from '../page-header';
import type { ItemListHandle, ListItem } from '../types';
import { VirtualizedList } from '../virtualized-list';
import { CollectionListHeader } from './collection-list-header';

export const VirtualizedCollectionList = ({
  setHideHeaderCreateNewCollection,
  handleCreateCollection,
}: {
  handleCreateCollection: () => void;
  setHideHeaderCreateNewCollection: (hide: boolean) => void;
}) => {
  const listRef = useRef<ItemListHandle>(null);
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(false);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>(
    []
  );
  const collectionService = useService(CollectionService);
  const collectionMetas = useLiveData(collectionService.collectionMetas$);
  const currentWorkspace = useService(WorkspaceService).workspace;

  const filteredSelectedCollectionIds = useMemo(() => {
    const ids = new Set(collectionMetas.map(collection => collection.id));
    return selectedCollectionIds.filter(id => ids.has(id));
  }, [collectionMetas, selectedCollectionIds]);

  const hideFloatingToolbar = useCallback(() => {
    listRef.current?.toggleSelectable();
  }, []);

  const collectionOperationRenderer = useCallback((item: ListItem) => {
    const collection = item;
    return (
      <CollectionOperationCell collectionMeta={collection as CollectionMeta} />
    );
  }, []);

  const collectionHeaderRenderer = useCallback(() => {
    return <ListTableHeader headerCols={collectionHeaderColsDef} />;
  }, []);

  const collectionItemRenderer = useCallback((item: ListItem) => {
    return <CollectionListItemRenderer {...item} />;
  }, []);

  const handleDelete = useCallback(() => {
    if (selectedCollectionIds.length === 0) {
      return;
    }
    for (const collectionId of selectedCollectionIds) {
      collectionService.deleteCollection(collectionId);
    }
    hideFloatingToolbar();
  }, [collectionService, hideFloatingToolbar, selectedCollectionIds]);

  return (
    <>
      <VirtualizedList
        ref={listRef}
        selectable="toggle"
        draggable
        atTopThreshold={80}
        atTopStateChange={setHideHeaderCreateNewCollection}
        onSelectionActiveChange={setShowFloatingToolbar}
        heading={<CollectionListHeader onCreate={handleCreateCollection} />}
        selectedIds={filteredSelectedCollectionIds}
        onSelectedIdsChange={setSelectedCollectionIds}
        items={collectionMetas}
        itemRenderer={collectionItemRenderer}
        rowAsLink
        docCollection={currentWorkspace.docCollection}
        operationsRenderer={collectionOperationRenderer}
        headerRenderer={collectionHeaderRenderer}
      />
      <ListFloatingToolbar
        open={showFloatingToolbar}
        content={
          <Trans
            i18nKey="com.affine.collection.toolbar.selected"
            count={selectedCollectionIds.length}
          >
            <div style={{ color: 'var(--affine-text-secondary-color)' }}>
              {{ count: selectedCollectionIds.length } as any}
            </div>
            selected
          </Trans>
        }
        onClose={hideFloatingToolbar}
        onDelete={handleDelete}
      />
    </>
  );
};
