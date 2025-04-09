import { MenuItem, notify } from '@affine/component';
import { filterPage } from '@affine/core/components/page-list';
import type { NodeOperation } from '@affine/core/desktop/components/navigation-panel';
import { CollectionService } from '@affine/core/modules/collection';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { DocsService } from '@affine/core/modules/doc';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/favorite';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { ShareDocsListService } from '@affine/core/modules/share-doc';
import type { Collection } from '@affine/env/filter';
import { PublicDocMode } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import type { DocMeta } from '@blocksuite/affine/store';
import { FilterMinusIcon, ViewLayersIcon } from '@blocksuite/icons/rc';
import { LiveData, useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AddItemPlaceholder } from '../../layouts/add-item-placeholder';
import { NavigationPanelTreeNode } from '../../tree/node';
import { NavigationPanelDocNode } from '../doc';
import {
  useNavigationPanelCollectionNodeOperations,
  useNavigationPanelCollectionNodeOperationsMenu,
} from './operations';

const CollectionIcon = () => <ViewLayersIcon />;

export const NavigationPanelCollectionNode = ({
  collectionId,
  operations: additionalOperations,
}: {
  collectionId: string;
  operations?: NodeOperation[];
}) => {
  const t = useI18n();
  const { globalContextService, collectionService, workspaceDialogService } =
    useServices({
      GlobalContextService,
      CollectionService,
      WorkspaceDialogService,
    });
  const active =
    useLiveData(globalContextService.globalContext.collectionId.$) ===
    collectionId;
  const [collapsed, setCollapsed] = useState(true);

  const collection = useLiveData(collectionService.collection$(collectionId));

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

  const collectionOperations = useNavigationPanelCollectionNodeOperationsMenu(
    collectionId,
    handleOpenCollapsed,
    handleEditCollection
  );
  const { handleAddDocToCollection } =
    useNavigationPanelCollectionNodeOperations(
      collectionId,
      handleOpenCollapsed,
      handleEditCollection
    );

  const finalOperations = useMemo(() => {
    if (additionalOperations) {
      return [...additionalOperations, ...collectionOperations];
    }
    return collectionOperations;
  }, [additionalOperations, collectionOperations]);

  if (!collection) {
    return null;
  }

  return (
    <NavigationPanelTreeNode
      icon={CollectionIcon}
      name={collection.name || t['Untitled']()}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      to={`/collection/${collection.id}`}
      active={active}
      operations={finalOperations}
      data-testid={`navigation-panel-collection-${collectionId}`}
    >
      <NavigationPanelCollectionNodeChildren
        collection={collection}
        onAddDoc={handleAddDocToCollection}
      />
    </NavigationPanelTreeNode>
  );
};

const NavigationPanelCollectionNodeChildren = ({
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
        publicMode === PublicDocMode.Edgeless
          ? ('edgeless' as const)
          : publicMode === PublicDocMode.Page
            ? ('page' as const)
            : undefined,
      favorite: favourites.some(fav => fav.id === meta.id),
    };
    return filterPage(collection, pageData);
  });

  return (
    <>
      {filtered.map(doc => (
        <NavigationPanelDocNode
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
