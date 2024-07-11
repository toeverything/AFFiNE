import {
  AnimatedCollectionsIcon,
  toast,
  useConfirmModal,
} from '@affine/component';
import { RenameModal } from '@affine/component/rename-modal';
import { Button, IconButton } from '@affine/component/ui/button';
import { usePageHelper } from '@affine/core/components/blocksuite/block-suite-page-list/utils';
import {
  CollectionOperations,
  filterPage,
  stopPropagation,
} from '@affine/core/components/page-list';
import {
  type DNDIdentifier,
  getDNDId,
  parseDNDId,
  resolveDragEndIntent,
} from '@affine/core/hooks/affine/use-global-dnd-helper';
import { CollectionService } from '@affine/core/modules/collection';
import { FavoriteItemsAdapter } from '@affine/core/modules/properties';
import type { Collection } from '@affine/env/filter';
import { useI18n } from '@affine/i18n';
import {
  MoreHorizontalIcon,
  PlusIcon,
  ViewLayersIcon,
} from '@blocksuite/icons/rc';
import type { DocCollection } from '@blocksuite/store';
import { type AnimateLayoutChanges, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useMemo, useState } from 'react';

import { useAllPageListConfig } from '../../../../hooks/affine/use-all-page-list-config';
import { useBlockSuiteDocMeta } from '../../../../hooks/use-block-suite-page-meta';
import { WorkbenchService } from '../../../../modules/workbench';
import { WorkbenchLink } from '../../../../modules/workbench/view/workbench-link';
import { DragMenuItemOverlay } from '../components/drag-menu-item-overlay';
import * as draggableMenuItemStyles from '../components/draggable-menu-item.css';
import { SidebarDocItem } from '../doc-tree/doc';
import { SidebarDocTreeNode } from '../doc-tree/node';
import type { CollectionsListProps } from '../index';
import * as styles from './styles.css';

const animateLayoutChanges: AnimateLayoutChanges = ({
  isSorting,
  wasDragging,
}) => (isSorting || wasDragging ? false : true);

export const CollectionSidebarNavItem = ({
  collection,
  docCollection,
  className,
  dndId,
}: {
  collection: Collection;
  docCollection: DocCollection;
  dndId: DNDIdentifier;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const collectionService = useService(CollectionService);
  const { createPage } = usePageHelper(docCollection);
  const { openConfirmModal } = useConfirmModal();
  const t = useI18n();

  const overlayPreview = useMemo(() => {
    return (
      <DragMenuItemOverlay icon={<ViewLayersIcon />} title={collection.name} />
    );
  }, [collection.name]);

  const {
    setNodeRef,
    isDragging,
    attributes,
    listeners,
    transform,
    over,
    active,
    transition,
  } = useSortable({
    id: dndId,
    data: {
      preview: overlayPreview,
    },
    animateLayoutChanges,
  });

  const isSorting = parseDNDId(active?.id)?.where === 'sidebar-pin';
  const dragOverIntent = resolveDragEndIntent(active, over);

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: isSorting ? transition : undefined,
  };

  const isOver = over?.id === dndId && dragOverIntent === 'collection:add';

  const currentPath = useLiveData(
    useService(WorkbenchService).workbench.location$.map(
      location => location.pathname
    )
  );
  const path = `/collection/${collection.id}`;

  const onRename = useCallback(
    (name: string) => {
      collectionService.updateCollection(collection.id, () => ({
        ...collection,
        name,
      }));
      toast(t['com.affine.toastMessage.rename']());
    },
    [collection, collectionService, t]
  );
  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);

  const createAndAddDocument = useCallback(() => {
    const newDoc = createPage();
    collectionService.addPageToCollection(collection.id, newDoc.id);
  }, [collection.id, collectionService, createPage]);

  const onConfirmAddDocToCollection = useCallback(() => {
    openConfirmModal({
      title: t['com.affine.collection.add-doc.confirm.title'](),
      description: t['com.affine.collection.add-doc.confirm.description'](),
      cancelText: t['Cancel'](),
      confirmButtonOptions: {
        type: 'primary',
        children: t['Confirm'](),
      },
      onConfirm: createAndAddDocument,
    });
  }, [createAndAddDocument, openConfirmModal, t]);

  const postfix = (
    <div
      onClick={stopPropagation}
      onMouseDown={e => {
        // prevent drag
        e.stopPropagation();
      }}
      style={{ display: 'flex', alignItems: 'center' }}
    >
      <IconButton onClick={onConfirmAddDocToCollection} size="small">
        <PlusIcon />
      </IconButton>
      <CollectionOperations
        collection={collection}
        openRenameModal={handleOpen}
        onAddDocToCollection={onConfirmAddDocToCollection}
      >
        <IconButton
          data-testid="collection-options"
          type="plain"
          size="small"
          style={{ marginLeft: 4 }}
        >
          <MoreHorizontalIcon />
        </IconButton>
      </CollectionOperations>
      <RenameModal
        open={open}
        onOpenChange={setOpen}
        onRename={onRename}
        currentName={collection.name}
      />
    </div>
  );

  return (
    <SidebarDocTreeNode
      ref={setNodeRef}
      node={{ type: 'collection', data: collection }}
      to={path}
      linkComponent={WorkbenchLink}
      subTree={
        <CollectionSidebarNavItemContent
          collection={collection}
          docCollection={docCollection}
          dndId={dndId}
        />
      }
      rootProps={{
        className,
        style,
        ...attributes,
      }}
      menuItemProps={{
        ...listeners,
        'data-draggable': true,
        'data-dragging': isDragging,
        'data-testid': 'collection-item',
        'data-collection-id': collection.id,
        'data-type': 'collection-list-item',
        className: draggableMenuItemStyles.draggableMenuItem,
        active: isOver || currentPath === path,
        icon: <AnimatedCollectionsIcon closed={isOver} />,
        postfix,
      }}
    >
      <span>{collection.name}</span>
    </SidebarDocTreeNode>
  );
};

const CollectionSidebarNavItemContent = ({
  collection,
  docCollection,
  dndId,
}: {
  collection: Collection;
  docCollection: DocCollection;
  dndId: DNDIdentifier;
}) => {
  const t = useI18n();
  const pages = useBlockSuiteDocMeta(docCollection);
  const favAdapter = useService(FavoriteItemsAdapter);
  const collectionService = useService(CollectionService);

  const config = useAllPageListConfig();
  const favourites = useLiveData(favAdapter.favorites$);
  const allowList = useMemo(
    () => new Set(collection.allowList),
    [collection.allowList]
  );
  const removeFromAllowList = useCallback(
    (id: string) => {
      collectionService.deletePageFromCollection(collection.id, id);
      toast(t['com.affine.collection.removePage.success']());
    },
    [collection, collectionService, t]
  );

  const filtered = pages.filter(meta => {
    if (meta.trash) return false;
    const pageData = {
      meta,
      publicMode: config.getPublicMode(meta.id),
      favorite: favourites.some(fav => fav.id === meta.id),
    };
    return filterPage(collection, pageData);
  });

  return (
    <div className={styles.docsListContainer}>
      {filtered.length > 0 ? (
        filtered.map(page => {
          return (
            <SidebarDocItem
              key={page.id}
              docId={page.id}
              postfixConfig={{
                inAllowList: allowList.has(page.id),
                removeFromAllowList: removeFromAllowList,
              }}
              dragConfig={{
                parentId: dndId,
                where: 'collection-list',
              }}
              menuItemProps={{
                'data-testid': 'collection-page',
              }}
            />
          );
        })
      ) : (
        <div className={styles.noReferences}>
          {t['com.affine.collection.emptyCollection']()}
        </div>
      )}
    </div>
  );
};

export const CollectionsList = ({
  docCollection: workspace,
  onCreate,
}: CollectionsListProps) => {
  const collections = useLiveData(useService(CollectionService).collections$);
  const t = useI18n();

  if (collections.length === 0) {
    return (
      <div className={styles.emptyCollectionWrapper}>
        <div className={styles.emptyCollectionContent}>
          <div className={styles.emptyCollectionIconWrapper}>
            <ViewLayersIcon className={styles.emptyCollectionIcon} />
          </div>
          <div
            data-testid="slider-bar-collection-null-description"
            className={styles.emptyCollectionMessage}
          >
            {t['com.affine.collections.empty.message']()}
          </div>
        </div>
        <Button className={styles.emptyCollectionNewButton} onClick={onCreate}>
          {t['com.affine.collections.empty.new-collection-button']()}
        </Button>
      </div>
    );
  }
  return (
    <div data-testid="collections" className={styles.wrapper}>
      {collections.map(view => {
        const dragItemId = getDNDId(
          'sidebar-collections',
          'collection',
          view.id
        );

        return (
          <CollectionSidebarNavItem
            key={view.id}
            collection={view}
            docCollection={workspace}
            dndId={dragItemId}
          />
        );
      })}
    </div>
  );
};
