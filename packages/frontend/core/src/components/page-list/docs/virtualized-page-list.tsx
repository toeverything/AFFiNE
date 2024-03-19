import { toast } from '@affine/component';
import { useBlockSuiteMetaHelper } from '@affine/core/hooks/affine/use-block-suite-meta-helper';
import { useTrashModalHelper } from '@affine/core/hooks/affine/use-trash-modal-helper';
import { useBlockSuiteDocMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import type { Tag } from '@affine/core/modules/tag';
import { Workbench } from '@affine/core/modules/workbench';
import type { Collection, Filter } from '@affine/env/filter';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { DocMeta } from '@blocksuite/store';
import { useService } from '@toeverything/infra';
import { Workspace } from '@toeverything/infra';
import { useCallback, useMemo, useRef, useState } from 'react';

import { usePageHelper } from '../../blocksuite/block-suite-page-list/utils';
import { ListFloatingToolbar } from '../components/list-floating-toolbar';
import { pageHeaderColsDef } from '../header-col-def';
import { PageOperationCell } from '../operation-cell';
import { PageListItemRenderer } from '../page-group';
import { ListTableHeader } from '../page-header';
import type { ItemListHandle, ListItem } from '../types';
import { useFilteredPageMetas } from '../use-filtered-page-metas';
import type { AllPageListConfig } from '../view/edit-collection/edit-collection';
import { VirtualizedList } from '../virtualized-list';
import {
  CollectionPageListHeader,
  PageListHeader,
  TagPageListHeader,
} from './page-list-header';

const usePageOperationsRenderer = () => {
  const currentWorkspace = useService(Workspace);
  const { setTrashModal } = useTrashModalHelper(currentWorkspace.docCollection);
  const { toggleFavorite, duplicate } = useBlockSuiteMetaHelper(
    currentWorkspace.docCollection
  );
  const t = useAFFiNEI18N();
  const workbench = useService(Workbench);

  const pageOperationsRenderer = useCallback(
    (page: DocMeta) => {
      const onDisablePublicSharing = () => {
        toast('Successfully disabled', {
          portal: document.body,
        });
      };

      return (
        <PageOperationCell
          favorite={!!page.favorite}
          isPublic={!!page.isPublic}
          onDisablePublicSharing={onDisablePublicSharing}
          link={`/workspace/${currentWorkspace.id}/${page.id}`}
          onOpenInSplitView={() => workbench.openPage(page.id, { at: 'tail' })}
          onDuplicate={() => {
            duplicate(page.id, false);
          }}
          onRemoveToTrash={() =>
            setTrashModal({
              open: true,
              pageIds: [page.id],
              pageTitles: [page.title],
            })
          }
          onToggleFavoritePage={() => {
            const status = page.favorite;
            toggleFavorite(page.id);
            toast(
              status
                ? t['com.affine.toastMessage.removedFavorites']()
                : t['com.affine.toastMessage.addedFavorites']()
            );
          }}
        />
      );
    },
    [
      currentWorkspace.id,
      workbench,
      duplicate,
      setTrashModal,
      toggleFavorite,
      t,
    ]
  );

  return pageOperationsRenderer;
};

export const VirtualizedPageList = ({
  tag,
  collection,
  filters,
  config,
  listItem,
  setHideHeaderCreateNewPage,
}: {
  tag?: Tag;
  collection?: Collection;
  filters?: Filter[];
  config?: AllPageListConfig;
  listItem?: DocMeta[];
  setHideHeaderCreateNewPage?: (hide: boolean) => void;
}) => {
  const listRef = useRef<ItemListHandle>(null);
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const currentWorkspace = useService(Workspace);
  const pageMetas = useBlockSuiteDocMeta(currentWorkspace.docCollection);
  const pageOperations = usePageOperationsRenderer();
  const { isPreferredEdgeless } = usePageHelper(currentWorkspace.docCollection);

  const filteredPageMetas = useFilteredPageMetas(currentWorkspace, pageMetas, {
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
    const ids = pageMetasToRender.map(page => page.id);
    return selectedPageIds.filter(id => ids.includes(id));
  }, [pageMetasToRender, selectedPageIds]);

  const hideFloatingToolbar = useCallback(() => {
    listRef.current?.toggleSelectable();
  }, []);

  const pageOperationRenderer = useCallback(
    (item: ListItem) => {
      const page = item as DocMeta;
      return pageOperations(page);
    },
    [pageOperations]
  );

  const pageHeaderRenderer = useCallback(() => {
    return <ListTableHeader headerCols={pageHeaderColsDef} />;
  }, []);

  const pageItemRenderer = useCallback((item: ListItem) => {
    return <PageListItemRenderer {...item} />;
  }, []);

  const heading = useMemo(() => {
    if (tag) {
      return <TagPageListHeader workspaceId={currentWorkspace.id} tag={tag} />;
    }
    if (collection && config) {
      return (
        <CollectionPageListHeader
          workspaceId={currentWorkspace.id}
          collection={collection}
          config={config}
        />
      );
    }
    return <PageListHeader />;
  }, [collection, config, currentWorkspace.id, tag]);

  const { setTrashModal } = useTrashModalHelper(currentWorkspace.docCollection);

  const handleMultiDelete = useCallback(() => {
    const pageNameMapping = Object.fromEntries(
      pageMetas.map(meta => [meta.id, meta.title])
    );

    const pageNames = filteredSelectedPageIds.map(
      id => pageNameMapping[id] ?? ''
    );
    setTrashModal({
      open: true,
      pageIds: filteredSelectedPageIds,
      pageTitles: pageNames,
    });
    hideFloatingToolbar();
  }, [filteredSelectedPageIds, hideFloatingToolbar, pageMetas, setTrashModal]);

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
        selectedIds={filteredSelectedPageIds}
        onSelectedIdsChange={setSelectedPageIds}
        items={pageMetasToRender}
        rowAsLink
        isPreferredEdgeless={isPreferredEdgeless}
        docCollection={currentWorkspace.docCollection}
        operationsRenderer={pageOperationRenderer}
        itemRenderer={pageItemRenderer}
        headerRenderer={pageHeaderRenderer}
      />
      <ListFloatingToolbar
        open={showFloatingToolbar && filteredSelectedPageIds.length > 0}
        onDelete={handleMultiDelete}
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
};
