import {
  AnimatedCollectionsIcon,
  type DropTargetDropEvent,
  type DropTargetOptions,
  MenuItem,
  toast,
} from '@affine/component';
import { filterPage } from '@affine/core/components/page-list';
import { CollectionService } from '@affine/core/modules/collection';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/favorite';
import { ShareDocsListService } from '@affine/core/modules/share-doc';
import type { AffineDNDData } from '@affine/core/types/dnd';
import type { Collection } from '@affine/env/filter';
import { PublicPageMode } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import type { DocMeta } from '@blocksuite/affine/store';
import { FilterMinusIcon } from '@blocksuite/icons/rc';
import {
  DocsService,
  GlobalContextService,
  LiveData,
  useLiveData,
  useService,
  useServices,
} from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ExplorerTreeNode, type ExplorerTreeNodeDropEffect } from '../../tree';
import type { ExplorerTreeNodeIcon } from '../../tree/node';
import { ExplorerDocNode } from '../doc';
import type { GenericExplorerNode } from '../types';
import { Empty } from './empty';
import { useExplorerCollectionNodeOperations } from './operations';

const CollectionIcon: ExplorerTreeNodeIcon = ({
  className,
  draggedOver,
  treeInstruction,
}) => (
  <AnimatedCollectionsIcon
    className={className}
    closed={!!draggedOver && treeInstruction?.type === 'make-child'}
  />
);

export const ExplorerCollectionNode = ({
  collectionId,
  onDrop,
  location,
  reorderable,
  operations: additionalOperations,
  canDrop,
  dropEffect,
}: {
  collectionId: string;
} & GenericExplorerNode) => {
  const t = useI18n();
  const { globalContextService, workspaceDialogService } = useServices({
    GlobalContextService,
    WorkspaceDialogService,
  });
  const active =
    useLiveData(globalContextService.globalContext.collectionId.$) ===
    collectionId;
  const [collapsed, setCollapsed] = useState(true);

  const collectionService = useService(CollectionService);
  const collection = useLiveData(collectionService.collection$(collectionId));

  const dndData = useMemo(() => {
    return {
      draggable: {
        entity: {
          type: 'collection',
          id: collectionId,
        },
        from: location,
      },
      dropTarget: {
        at: 'explorer:doc',
      },
    } satisfies AffineDNDData;
  }, [collectionId, location]);

  const handleRename = useCallback(
    (name: string) => {
      if (collection && collection.name !== name) {
        collectionService.updateCollection(collectionId, () => ({
          ...collection,
          name,
        }));

        track.$.navigationPanel.organize.renameOrganizeItem({
          type: 'collection',
        });
        toast(t['com.affine.toastMessage.rename']());
      }
    },
    [collection, collectionId, collectionService, t]
  );

  const handleAddDocToCollection = useCallback(
    (docId: string) => {
      if (!collection) {
        return;
      }
      if (collection.allowList.includes(docId)) {
        toast(t['com.affine.collection.addPage.alreadyExists']());
      } else {
        collectionService.addPageToCollection(collection.id, docId);
      }
    },
    [collection, collectionService, t]
  );

  const handleDropOnCollection = useCallback(
    (data: DropTargetDropEvent<AffineDNDData>) => {
      if (collection && data.treeInstruction?.type === 'make-child') {
        if (data.source.data.entity?.type === 'doc') {
          handleAddDocToCollection(data.source.data.entity.id);
          track.$.navigationPanel.organize.createOrganizeItem({
            type: 'link',
            target: 'doc',
            control: 'drag',
          });
        }
      } else {
        onDrop?.(data);
      }
    },
    [collection, onDrop, handleAddDocToCollection]
  );

  const handleDropEffectOnCollection = useCallback<ExplorerTreeNodeDropEffect>(
    data => {
      if (collection && data.treeInstruction?.type === 'make-child') {
        if (data.source.data.entity?.type === 'doc') {
          return 'link';
        }
      } else {
        return dropEffect?.(data);
      }
      return;
    },
    [collection, dropEffect]
  );

  const handleDropOnPlaceholder = useCallback(
    (data: DropTargetDropEvent<AffineDNDData>) => {
      if (collection && data.source.data.entity?.type === 'doc') {
        handleAddDocToCollection(data.source.data.entity.id);
        track.$.navigationPanel.organize.createOrganizeItem({
          type: 'collection',
          control: 'drag',
        });
      }
    },
    [collection, handleAddDocToCollection]
  );

  const handleOpenCollapsed = useCallback(() => {
    setCollapsed(false);
  }, []);

  const handleEditCollection = useCallback(() => {
    if (!collection) {
      return;
    }
    workspaceDialogService.open('collection-editor', {
      collectionId: collection.id,
    });
  }, [collection, workspaceDialogService]);

  const collectionOperations = useExplorerCollectionNodeOperations(
    collectionId,
    handleOpenCollapsed,
    handleEditCollection
  );

  const finalOperations = useMemo(() => {
    if (additionalOperations) {
      return [...additionalOperations, ...collectionOperations];
    }
    return collectionOperations;
  }, [collectionOperations, additionalOperations]);

  const handleCanDrop = useMemo<DropTargetOptions<AffineDNDData>['canDrop']>(
    () => args => {
      const entityType = args.source.data.entity?.type;
      return args.treeInstruction?.type !== 'make-child'
        ? ((typeof canDrop === 'function' ? canDrop(args) : canDrop) ?? true)
        : entityType === 'doc';
    },
    [canDrop]
  );

  if (!collection) {
    return null;
  }

  return (
    <ExplorerTreeNode
      icon={CollectionIcon}
      name={collection.name || t['Untitled']()}
      dndData={dndData}
      onDrop={handleDropOnCollection}
      renameable
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      to={`/collection/${collection.id}`}
      active={active}
      canDrop={handleCanDrop}
      reorderable={reorderable}
      onRename={handleRename}
      childrenPlaceholder={<Empty onDrop={handleDropOnPlaceholder} />}
      operations={finalOperations}
      dropEffect={handleDropEffectOnCollection}
      data-testid={`explorer-collection-${collectionId}`}
    >
      <ExplorerCollectionNodeChildren collection={collection} />
    </ExplorerTreeNode>
  );
};

const ExplorerCollectionNodeChildren = ({
  collection,
}: {
  collection: Collection;
}) => {
  const t = useI18n();
  const {
    docsService,
    compatibleFavoriteItemsAdapter,
    shareDocsListService,
    collectionService,
  } = useServices({
    DocsService,
    CompatibleFavoriteItemsAdapter,
    ShareDocsListService,
    CollectionService,
  });

  useEffect(() => {
    // TODO(@eyhn): loading & error UI
    shareDocsListService.shareDocs?.revalidate();
  }, [shareDocsListService]);

  const docMetas = useLiveData(
    useMemo(
      () =>
        LiveData.computed(get => {
          return get(docsService.list.docs$).map(
            doc => get(doc.meta$) as DocMeta
          );
        }),
      [docsService]
    )
  );
  const favourites = useLiveData(compatibleFavoriteItemsAdapter.favorites$);
  const allowList = useMemo(
    () => new Set(collection.allowList),
    [collection.allowList]
  );
  const shareDocs = useLiveData(shareDocsListService.shareDocs?.list$);

  const handleRemoveFromAllowList = useCallback(
    (id: string) => {
      track.$.navigationPanel.collections.removeOrganizeItem({ type: 'doc' });
      collectionService.deletePageFromCollection(collection.id, id);
      toast(t['com.affine.collection.removePage.success']());
    },
    [collection.id, collectionService, t]
  );

  const filtered = docMetas.filter(meta => {
    if (meta.trash) return false;
    const publicMode = shareDocs?.find(d => d.id === meta.id)?.mode;
    const pageData = {
      meta: meta as DocMeta,
      publicMode:
        publicMode === PublicPageMode.Edgeless
          ? ('edgeless' as const)
          : publicMode === PublicPageMode.Page
            ? ('page' as const)
            : undefined,
      favorite: favourites.some(fav => fav.id === meta.id),
    };
    return filterPage(collection, pageData);
  });

  return filtered.map(doc => (
    <ExplorerDocNode
      key={doc.id}
      docId={doc.id}
      reorderable={false}
      location={{
        at: 'explorer:collection:filtered-docs',
        collectionId: collection.id,
      }}
      operations={
        allowList
          ? [
              {
                index: 99,
                view: (
                  <MenuItem
                    prefixIcon={<FilterMinusIcon />}
                    onClick={() => handleRemoveFromAllowList(doc.id)}
                  >
                    {t['Remove special filter']()}
                  </MenuItem>
                ),
              },
            ]
          : []
      }
    />
  ));
};
