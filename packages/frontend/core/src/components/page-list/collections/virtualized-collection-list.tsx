import { useDeleteCollectionInfo } from '@affine/core/hooks/affine/use-delete-collection-info';
import type { Collection, DeleteCollectionInfo } from '@affine/env/filter';
import { Trans } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import { Workspace } from '@toeverything/infra';
import {
  type ReactElement,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';

import { CollectionService } from '../../../modules/collection';
import { ListFloatingToolbar } from '../components/list-floating-toolbar';
import { collectionHeaderColsDef } from '../header-col-def';
import { CollectionOperationCell } from '../operation-cell';
import { CollectionListItemRenderer } from '../page-group';
import { ListTableHeader } from '../page-header';
import type { CollectionMeta, ItemListHandle, ListItem } from '../types';
import type { AllPageListConfig } from '../view';
import { VirtualizedList } from '../virtualized-list';
import { CollectionListHeader } from './collection-list-header';

const useCollectionOperationsRenderer = ({
  info,
  service,
  config,
}: {
  info: DeleteCollectionInfo;
  config: AllPageListConfig;
  service: CollectionService;
}) => {
  const collectionOperationsRenderer = useCallback(
    (collection: Collection) => {
      return (
        <CollectionOperationCell
          info={info}
          collection={collection}
          service={service}
          config={config}
        />
      );
    },
    [config, info, service]
  );

  return collectionOperationsRenderer;
};

export const VirtualizedCollectionList = ({
  collections,
  collectionMetas,
  setHideHeaderCreateNewCollection,
  node,
  handleCreateCollection,
  config,
}: {
  collections: Collection[];
  collectionMetas: CollectionMeta[];
  config: AllPageListConfig;
  node: ReactElement | null;
  handleCreateCollection: () => void;
  setHideHeaderCreateNewCollection: (hide: boolean) => void;
}) => {
  const listRef = useRef<ItemListHandle>(null);
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(false);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>(
    []
  );
  const collectionService = useService(CollectionService);
  const currentWorkspace = useService(Workspace);
  const info = useDeleteCollectionInfo();

  const collectionOperations = useCollectionOperationsRenderer({
    info,
    service: collectionService,
    config,
  });

  const filteredSelectedCollectionIds = useMemo(() => {
    const ids = collections.map(collection => collection.id);
    return selectedCollectionIds.filter(id => ids.includes(id));
  }, [collections, selectedCollectionIds]);

  const hideFloatingToolbar = useCallback(() => {
    listRef.current?.toggleSelectable();
  }, []);

  const collectionOperationRenderer = useCallback(
    (item: ListItem) => {
      const collection = item as CollectionMeta;
      return collectionOperations(collection);
    },
    [collectionOperations]
  );

  const collectionHeaderRenderer = useCallback(() => {
    return <ListTableHeader headerCols={collectionHeaderColsDef} />;
  }, []);

  const collectionItemRenderer = useCallback((item: ListItem) => {
    return <CollectionListItemRenderer {...item} />;
  }, []);

  const handleDelete = useCallback(() => {
    return collectionService.deleteCollection(info, ...selectedCollectionIds);
  }, [collectionService, info, selectedCollectionIds]);

  return (
    <>
      <VirtualizedList
        ref={listRef}
        selectable="toggle"
        draggable={false}
        groupBy={false}
        atTopThreshold={80}
        atTopStateChange={setHideHeaderCreateNewCollection}
        onSelectionActiveChange={setShowFloatingToolbar}
        heading={
          <CollectionListHeader node={node} onCreate={handleCreateCollection} />
        }
        selectedIds={filteredSelectedCollectionIds}
        onSelectedIdsChange={setSelectedCollectionIds}
        items={collectionMetas}
        itemRenderer={collectionItemRenderer}
        rowAsLink
        blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
        operationsRenderer={collectionOperationRenderer}
        headerRenderer={collectionHeaderRenderer}
      />
      <ListFloatingToolbar
        open={showFloatingToolbar && selectedCollectionIds.length > 0}
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
