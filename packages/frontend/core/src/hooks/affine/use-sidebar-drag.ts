import { toast } from '@affine/component';
import type { DraggableTitleCellData } from '@affine/core/components/page-list';
import { usePageMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { DragEndEvent, UniqueIdentifier } from '@dnd-kit/core';
import { Workspace } from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import { useCallback } from 'react';

import { useBlockSuiteMetaHelper } from './use-block-suite-meta-helper';
import { useTrashModalHelper } from './use-trash-modal-helper';

// Unique droppable IDs
export const DropPrefix = {
  SidebarCollections: 'sidebar-collections-',
  SidebarTrash: 'sidebar-trash',
  SidebarFavorites: 'sidebar-favorites',
};

export const DragPrefix = {
  PageListItem: 'page-list-item-title-',
  FavouriteListItem: 'favourite-list-item-',
  CollectionListItem: 'collection-list-item-',
  CollectionListPageItem: 'collection-list-page-item-',
};

export function getDropItemId(
  type: 'collections' | 'trash' | 'favorites',
  id?: string
): string {
  let prefix = '';
  switch (type) {
    case 'collections':
      prefix = DropPrefix.SidebarCollections;
      break;
    case 'trash':
      prefix = DropPrefix.SidebarTrash;
      break;
    case 'favorites':
      prefix = DropPrefix.SidebarFavorites;
      break;
  }

  return `${prefix}${id}`;
}

export function getDragItemId(
  type: 'collection' | 'page' | 'collectionPage' | 'favouritePage',
  id: string
): string {
  let prefix = '';
  switch (type) {
    case 'collection':
      prefix = DragPrefix.CollectionListItem;
      break;
    case 'page':
      prefix = DragPrefix.PageListItem;
      break;
    case 'collectionPage':
      prefix = DragPrefix.CollectionListPageItem;
      break;
    case 'favouritePage':
      prefix = DragPrefix.FavouriteListItem;
      break;
  }

  return `${prefix}${id}`;
}

export const useSidebarDrag = () => {
  const t = useAFFiNEI18N();
  const currentWorkspace = useService(Workspace);
  const workspace = currentWorkspace.blockSuiteWorkspace;
  const { setTrashModal } = useTrashModalHelper(workspace);
  const { addToFavorite, removeFromFavorite } =
    useBlockSuiteMetaHelper(workspace);
  const { getPageMeta } = usePageMetaHelper(workspace);

  const isDropArea = useCallback(
    (id: UniqueIdentifier | undefined, prefix: string) => {
      return typeof id === 'string' && id.startsWith(prefix);
    },
    []
  );

  const processDrag = useCallback(
    (e: DragEndEvent, dropPrefix: string, action: (pageId: string) => void) => {
      const validPrefixes = Object.values(DragPrefix);
      const isActiveIdValid = validPrefixes.some(pref =>
        String(e.active.id).startsWith(pref)
      );
      if (isDropArea(e.over?.id, dropPrefix) && isActiveIdValid) {
        const { pageId } = e.active.data.current as DraggableTitleCellData;
        action(pageId);
      }
      return;
    },
    [isDropArea]
  );

  const processCollectionsDrag = useCallback(
    (e: DragEndEvent) =>
      processDrag(e, DropPrefix.SidebarCollections, pageId => {
        e.over?.data.current?.addToCollection?.(pageId);
      }),
    [processDrag]
  );

  const processMoveToTrashDrag = useCallback(
    (e: DragEndEvent) => {
      const { pageId } = e.active.data.current as DraggableTitleCellData;
      const pageTitle = getPageMeta(pageId)?.title ?? t['Untitled']();
      processDrag(e, DropPrefix.SidebarTrash, pageId => {
        setTrashModal({
          open: true,
          pageIds: [pageId],
          pageTitles: [pageTitle],
        });
      });
    },
    [getPageMeta, processDrag, setTrashModal, t]
  );

  const processFavouritesDrag = useCallback(
    (e: DragEndEvent) => {
      const { pageId } = e.active.data.current as DraggableTitleCellData;
      const isFavourited = getPageMeta(pageId)?.favorite;
      const isFavouriteDrag = String(e.over?.id).startsWith(
        DropPrefix.SidebarFavorites
      );
      if (isFavourited && isFavouriteDrag) {
        return toast(t['com.affine.collection.addPage.alreadyExists']());
      }
      processDrag(e, DropPrefix.SidebarFavorites, pageId => {
        addToFavorite(pageId);
        toast(t['com.affine.cmdk.affine.editor.add-to-favourites']());
      });
    },
    [getPageMeta, processDrag, addToFavorite, t]
  );

  const processRemoveDrag = useCallback(
    (e: DragEndEvent) => {
      if (e.over) {
        return;
      }

      if (String(e.active.id).startsWith(DragPrefix.FavouriteListItem)) {
        const pageId = e.active.data.current?.pageId;
        removeFromFavorite(pageId);
        toast(t['com.affine.cmdk.affine.editor.remove-from-favourites']());
        return;
      }
      if (String(e.active.id).startsWith(DragPrefix.CollectionListPageItem)) {
        return e.active.data.current?.removeFromCollection?.();
      }
    },

    [removeFromFavorite, t]
  );

  return useCallback(
    (e: DragEndEvent) => {
      processCollectionsDrag(e);
      processFavouritesDrag(e);
      processMoveToTrashDrag(e);
      processRemoveDrag(e);
    },
    [
      processCollectionsDrag,
      processFavouritesDrag,
      processMoveToTrashDrag,
      processRemoveDrag,
    ]
  );
};
