import { toast, useConfirmModal } from '@affine/component';
import { useBlockSuiteDocMeta } from '@affine/core/components/hooks/use-block-suite-page-meta';
import { CollectionService } from '@affine/core/modules/collection';
import { DocsService } from '@affine/core/modules/doc';
import type { Tag } from '@affine/core/modules/tag';
import { WorkspaceService } from '@affine/core/modules/workspace';
import type { Collection, Filter } from '@affine/env/filter';
import { Trans, useI18n } from '@affine/i18n';
import type { DocMeta } from '@blocksuite/affine/store';
import { useService } from '@toeverything/infra';
import { memo, useCallback, useMemo, useRef, useState } from 'react';

import { ListFloatingToolbar } from '../components/list-floating-toolbar';
import { usePageItemGroupDefinitions } from '../group-definitions';
import { usePageHeaderColsDef } from '../header-col-def';
import { PageOperationCell } from '../operation-cell';
import { PageListItemRenderer } from '../page-group';
import { ListTableHeader } from '../page-header';
import type { ItemListHandle, ListItem } from '../types';
import { useFilteredPageMetas } from '../use-filtered-page-metas';
import { VirtualizedList } from '../virtualized-list';
import {
  CollectionPageListHeader,
  PageListHeader,
  TagPageListHeader,
} from './page-list-header';

const usePageOperationsRenderer = () => {
  const t = useI18n();
  const collectionService = useService(CollectionService);
  const removeFromAllowList = useCallback(
    (id: string) => {
      collectionService.deletePagesFromCollections([id]);
      toast(t['com.affine.collection.removePage.success']());
    },
    [collectionService, t]
  );
  const pageOperationsRenderer = useCallback(
    (page: DocMeta, isInAllowList?: boolean) => {
      return (
        <PageOperationCell
          page={page}
          isInAllowList={isInAllowList}
          onRemoveFromAllowList={() => removeFromAllowList(page.id)}
        />
      );
    },
    [removeFromAllowList]
  );
  return pageOperationsRenderer;
};

export const VirtualizedPageList = memo(function VirtualizedPageList({
  tag,
  collection,
  filters,
  listItem,
  setHideHeaderCreateNewPage,
  disableMultiDelete,
}: {
  tag?: Tag;
  collection?: Collection;
  filters?: Filter[];
  listItem?: DocMeta[];
  setHideHeaderCreateNewPage?: (hide: boolean) => void;
  disableMultiDelete?: boolean;
}) {
  const t = useI18n();
  const listRef = useRef<ItemListHandle>(null);
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const currentWorkspace = useService(WorkspaceService).workspace;
  const docsService = useService(DocsService);
  const pageMetas = useBlockSuiteDocMeta(currentWorkspace.docCollection);
  const pageOperations = usePageOperationsRenderer();
  const pageHeaderColsDef = usePageHeaderColsDef();

  const filteredPageMetas = useFilteredPageMetas(pageMetas, {
    filters,
    collection,
  });
  const pageMetasToRender = useMemo(() => {
    if (listItem) {
      return listItem;
    }
    return filteredPageMetas;
  }, [filteredPageMetas, listItem]);

  const filteredSelectedPageIds = useMemo(() => {
    const ids = new Set(pageMetasToRender.map(page => page.id));
    return selectedPageIds.filter(id => ids.has(id));
  }, [pageMetasToRender, selectedPageIds]);

  const hideFloatingToolbar = useCallback(() => {
    listRef.current?.toggleSelectable();
  }, []);

  const pageOperationRenderer = useCallback(
    (item: ListItem) => {
      const page = item as DocMeta;
      const isInAllowList = collection?.allowList?.includes(page.id);
      return pageOperations(page, isInAllowList);
    },
    [collection, pageOperations]
  );

  const pageHeaderRenderer = useCallback(() => {
    return <ListTableHeader headerCols={pageHeaderColsDef} />;
  }, [pageHeaderColsDef]);

  const pageItemRenderer = useCallback((item: ListItem) => {
    return <PageListItemRenderer {...item} />;
  }, []);

  const heading = useMemo(() => {
    if (tag) {
      return <TagPageListHeader workspaceId={currentWorkspace.id} tag={tag} />;
    }
    if (collection) {
      return (
        <CollectionPageListHeader
          workspaceId={currentWorkspace.id}
          collection={collection}
        />
      );
    }
    return <PageListHeader />;
  }, [collection, currentWorkspace.id, tag]);

  const { openConfirmModal } = useConfirmModal();

  const handleMultiDelete = useCallback(() => {
    if (filteredSelectedPageIds.length === 0) {
      return;
    }

    openConfirmModal({
      title: t['com.affine.moveToTrash.confirmModal.title.multiple']({
        number: filteredSelectedPageIds.length.toString(),
      }),
      description: t[
        'com.affine.moveToTrash.confirmModal.description.multiple'
      ]({
        number: filteredSelectedPageIds.length.toString(),
      }),
      cancelText: t['com.affine.confirmModal.button.cancel'](),
      confirmText: t.Delete(),
      confirmButtonOptions: {
        variant: 'error',
      },
      onConfirm: () => {
        for (const docId of filteredSelectedPageIds) {
          const doc = docsService.list.doc$(docId).value;
          doc?.moveToTrash();
        }
      },
    });
    hideFloatingToolbar();
  }, [
    docsService.list,
    filteredSelectedPageIds,
    hideFloatingToolbar,
    openConfirmModal,
    t,
  ]);

  const group = usePageItemGroupDefinitions();

  return (
    <>
      <VirtualizedList
        ref={listRef}
        selectable="toggle"
        draggable
        atTopThreshold={80}
        atTopStateChange={setHideHeaderCreateNewPage}
        onSelectionActiveChange={setShowFloatingToolbar}
        heading={heading}
        groupBy={group}
        selectedIds={filteredSelectedPageIds}
        onSelectedIdsChange={setSelectedPageIds}
        items={pageMetasToRender}
        rowAsLink
        docCollection={currentWorkspace.docCollection}
        operationsRenderer={pageOperationRenderer}
        itemRenderer={pageItemRenderer}
        headerRenderer={pageHeaderRenderer}
      />
      <ListFloatingToolbar
        open={showFloatingToolbar}
        onDelete={disableMultiDelete ? undefined : handleMultiDelete}
        onClose={hideFloatingToolbar}
        content={
          <Trans
            i18nKey="com.affine.page.toolbar.selected"
            count={filteredSelectedPageIds.length}
          >
            <div style={{ color: 'var(--affine-text-secondary-color)' }}>
              {{ count: filteredSelectedPageIds.length } as any}
            </div>
            selected
          </Trans>
        }
      />
    </>
  );
});
