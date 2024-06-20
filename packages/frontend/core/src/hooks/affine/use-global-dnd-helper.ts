import { toast } from '@affine/component';
import { useDocMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { CollectionService } from '@affine/core/modules/collection';
import { FavoriteItemsAdapter } from '@affine/core/modules/properties';
import { useI18n } from '@affine/i18n';
import type {
  Active,
  DragEndEvent,
  Over,
  UniqueIdentifier,
} from '@dnd-kit/core';
import { useLiveData, useService, WorkspaceService } from '@toeverything/infra';
import { useMemo } from 'react';

import { useDeleteCollectionInfo } from './use-delete-collection-info';
import { useTrashModalHelper } from './use-trash-modal-helper';

export type DndWhere =
  | 'sidebar-pin'
  | 'sidebar-collections'
  | 'sidebar-trash'
  | 'doc-list'
  | 'collection-list'
  | 'tag-list';

export type DNDItemKind = 'container' | 'collection' | 'doc' | 'tag';

// where:kind:id
// we want to make the id something that can be used to identify the item
//
// Note, not all combinations are valid
type DNDItemIdentifier = `${DndWhere}:${DNDItemKind}:${string}`;
export type DNDIdentifier =
  | `${DNDItemIdentifier}/${DNDItemIdentifier}`
  | DNDItemIdentifier;

export type DndItem = {
  where: DndWhere;
  kind: DNDItemKind;
  itemId: string;
  parent?: DndItem; // for now we only support one level of nesting
};

export function getDNDId(
  where: DndWhere,
  kind: DNDItemKind,
  id: string,
  parentId?: DNDIdentifier
): DNDIdentifier {
  const itemId = `${where}:${kind}:${id}` as DNDItemIdentifier;
  return parentId ? `${parentId}/${itemId}` : itemId;
}

export function parseDNDId(
  id: UniqueIdentifier | null | undefined
): DndItem | undefined {
  if (typeof id !== 'string') return undefined;
  const parts = id.split('/');
  if (parts.length === 1) {
    const [where, kind, itemId] = id.split(':') as [
      DndWhere,
      DNDItemKind,
      string,
    ];
    return where && kind && itemId
      ? {
          where,
          kind,
          itemId,
        }
      : undefined;
  } else if (parts.length === 2) {
    const item = parseDNDId(parts[1]);
    const parent = parseDNDId(parts[0]);
    if (!item || !parent) return undefined;
    return {
      ...item,
      parent,
    };
  } else {
    throw new Error('Invalid DND ID');
  }
}

export function resolveDragEndIntent(
  active?: Active | null,
  over?: Over | null
) {
  const dragItem = parseDNDId(active?.id);
  const dropItem = parseDNDId(over?.id);

  if (!dragItem) return null;

  // any doc item to trash
  if (
    dropItem?.where === 'sidebar-trash' &&
    (dragItem.kind === 'doc' || dragItem.kind === 'collection')
  ) {
    return 'trash:move-to';
  }

  // add page to collection
  if (
    dragItem.kind === 'doc' &&
    dragItem.where !== dropItem?.where &&
    dropItem?.kind === 'collection'
  ) {
    return 'collection:add';
  }

  // move a doc from one collection to another
  if (
    dragItem.kind === 'doc' &&
    dragItem?.where === 'collection-list' &&
    dragItem.parent?.kind === 'collection' &&
    dropItem?.kind !== 'collection'
  ) {
    return 'collection:remove';
  }

  // move any doc/collection to sidebar pin
  if (
    dragItem.where !== 'sidebar-pin' &&
    dropItem?.where === 'sidebar-pin' &&
    (dragItem.kind === 'doc' || dragItem.kind === 'collection')
  ) {
    return 'pin:add';
  }

  // from sidebar pin to sidebar pin (reorder)
  if (
    dragItem.where === 'sidebar-pin' &&
    dropItem?.where === 'sidebar-pin' &&
    (dragItem.kind === 'doc' || dragItem.kind === 'collection') &&
    (dropItem.kind === 'doc' || dropItem.kind === 'collection')
  ) {
    return 'pin:reorder';
  }

  // from sidebar pin to outside (remove from favourites)
  if (
    dragItem.where === 'sidebar-pin' &&
    dropItem?.where !== 'sidebar-pin' &&
    (dragItem.kind === 'doc' || dragItem.kind === 'collection')
  ) {
    return 'pin:remove';
  }

  return null;
}

export type GlobalDragEndIntent = ReturnType<typeof resolveDragEndIntent>;

export const useGlobalDNDHelper = () => {
  const t = useI18n();
  const currentWorkspace = useService(WorkspaceService).workspace;
  const favAdapter = useService(FavoriteItemsAdapter);
  const workspace = currentWorkspace.docCollection;
  const { setTrashModal } = useTrashModalHelper(workspace);
  const { getDocMeta } = useDocMetaHelper(workspace);
  const collectionService = useService(CollectionService);
  const collections = useLiveData(collectionService.collections$);
  const deleteInfo = useDeleteCollectionInfo();

  return useMemo(() => {
    return {
      handleDragEnd: (e: DragEndEvent) => {
        const intent = resolveDragEndIntent(e.active, e.over);

        const dragItem = parseDNDId(e.active.id);
        const dropItem = parseDNDId(e.over?.id);

        switch (intent) {
          case 'pin:remove':
            if (
              dragItem &&
              favAdapter.isFavorite(
                dragItem.itemId,
                dragItem.kind as 'doc' | 'collection'
              )
            ) {
              favAdapter.remove(
                dragItem.itemId,
                dragItem.kind as 'doc' | 'collection'
              );
              toast(
                t['com.affine.cmdk.affine.editor.remove-from-favourites']()
              );
            }
            return;

          case 'pin:reorder':
            if (dragItem && dropItem) {
              const fromId = FavoriteItemsAdapter.getFavItemKey(
                dragItem.itemId,
                dragItem.kind as 'doc' | 'collection'
              );
              const toId = FavoriteItemsAdapter.getFavItemKey(
                dropItem.itemId,
                dropItem.kind as 'doc' | 'collection'
              );
              favAdapter.sorter.move(fromId, toId);
            }

            return;

          case 'pin:add':
            if (
              dragItem &&
              !favAdapter.isFavorite(
                dragItem.itemId,
                dragItem.kind as 'doc' | 'collection'
              )
            ) {
              favAdapter.set(
                dragItem.itemId,
                dragItem.kind as 'collection' | 'doc',
                true
              );
              toast(t['com.affine.cmdk.affine.editor.add-to-favourites']());
            }
            return;

          case 'collection:add':
            if (dragItem && dropItem) {
              const pageId = dragItem.itemId;
              const collectionId = dropItem.itemId;
              const collection = collections.find(c => {
                return c.id === collectionId;
              });

              if (collection?.allowList.includes(pageId)) {
                toast(t['com.affine.collection.addPage.alreadyExists']());
              } else {
                collectionService.addPageToCollection(collectionId, pageId);
                toast(t['com.affine.collection.addPage.success']());
              }
            }
            return;

          case 'collection:remove':
            if (dragItem) {
              const pageId = dragItem.itemId;
              const collId = dragItem.parent?.itemId;
              if (collId) {
                collectionService.deletePageFromCollection(collId, pageId);
                toast(t['com.affine.collection.removePage.success']());
              }
            }
            return;

          case 'trash:move-to':
            if (dragItem) {
              const pageId = dragItem.itemId;
              if (dragItem.kind === 'doc') {
                const pageTitle = getDocMeta(pageId)?.title ?? t['Untitled']();
                setTrashModal({
                  open: true,
                  pageIds: [pageId],
                  pageTitles: [pageTitle],
                });
              } else {
                collectionService.deleteCollection(deleteInfo, dragItem.itemId);
              }
            }
            return;
          default:
            return;
        }
      },
    };
  }, [
    collectionService,
    collections,
    deleteInfo,
    favAdapter,
    getDocMeta,
    setTrashModal,
    t,
  ]);
};
