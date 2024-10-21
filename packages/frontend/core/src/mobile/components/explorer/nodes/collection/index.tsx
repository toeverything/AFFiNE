import { MenuItem, notify } from '@affine/component';
import {
  filterPage,
  useEditCollection,
} from '@affine/core/components/page-list';
import { CollectionService } from '@affine/core/modules/collection';
import type { NodeOperation } from '@affine/core/modules/explorer';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/favorite';
import { ShareDocsListService } from '@affine/core/modules/share-doc';
import type { Collection } from '@affine/env/filter';
import { PublicPageMode } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import type { DocMeta } from '@blocksuite/affine/store';
import { FilterMinusIcon, ViewLayersIcon } from '@blocksuite/icons/rc';
import {
  DocsService,
  GlobalContextService,
  LiveData,
  useLiveData,
  useServices,
} from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AddItemPlaceholder } from '../../layouts/add-item-placeholder';
import { ExplorerTreeNode } from '../../tree/node';
import { ExplorerDocNode } from '../doc';
import {
  useExplorerCollectionNodeOperations,
  useExplorerCollectionNodeOperationsMenu,
} from './operations';

const CollectionIcon = () => <ViewLayersIcon />;

export const ExplorerCollectionNode = ({
  collectionId,
  operations: additionalOperations,
}: {
  collectionId: string;
  operations?: NodeOperation[];
}) => {
  const t = useI18n();
  const { globalContextService, collectionService } = useServices({
    GlobalContextService,
    CollectionService,
  });
  const { open: openEditCollectionModal } = useEditCollection();
  const active =
    useLiveData(globalContextService.globalContext.collectionId.$) ===
    collectionId;
  const [collapsed, setCollapsed] = useState(true);

  const collection = useLiveData(collectionService.collection$(collectionId));

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
        notify.success({ message: t['com.affine.toastMessage.rename']() });
      }
    },
    [collection, collectionId, collectionService, t]
  );

  const handleOpenCollapsed = useCallback(() => {
    setCollapsed(false);
  }, []);

  const handleEditCollection = useCallback(() => {
    if (!collection) {
      return;
    }
    openEditCollectionModal(collection)
      .then(collection => {
        return collectionService.updateCollection(
          collection.id,
          () => collection
        );
      })
      .catch(err => {
        console.error(err);
      });
  }, [collection, collectionService, openEditCollectionModal]);

  const collectionOperations = useExplorerCollectionNodeOperationsMenu(
    collectionId,
    handleOpenCollapsed,
    handleEditCollection
  );
  const { handleAddDocToCollection } = useExplorerCollectionNodeOperations(
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

  if (!collection) {
    return null;
  }

  return (
    <ExplorerTreeNode
      icon={CollectionIcon}
      name={collection.name || t['Untitled']()}
      renameable
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      to={`/collection/${collection.id}`}
      active={active}
      onRename={handleRename}
      operations={finalOperations}
      data-testid={`explorer-collection-${collectionId}`}
    >
      <ExplorerCollectionNodeChildren
        collection={collection}
        onAddDoc={handleAddDocToCollection}
      />
    </ExplorerTreeNode>
  );
};

const ExplorerCollectionNodeChildren = ({
  collection,
  onAddDoc,
}: {
  collection: Collection;
  onAddDoc?: () => void;
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
      notify.success({
        message: t['com.affine.collection.removePage.success'](),
      });
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

  return (
    <>
      {filtered.map(doc => (
        <ExplorerDocNode
          key={doc.id}
          docId={doc.id}
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
      ))}
      <AddItemPlaceholder label={t['New Page']()} onClick={onAddDoc} />
    </>
  );
};
