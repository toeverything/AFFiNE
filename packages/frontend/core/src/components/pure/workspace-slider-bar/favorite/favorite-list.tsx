import { CategoryDivider } from '@affine/core/components/app-sidebar';
import {
  getDNDId,
  resolveDragEndIntent,
} from '@affine/core/hooks/affine/use-global-dnd-helper';
import { CollectionService } from '@affine/core/modules/collection';
import { FavoriteItemsAdapter } from '@affine/core/modules/properties';
import type { WorkspaceFavoriteItem } from '@affine/core/modules/properties/services/schema';
import { useI18n } from '@affine/i18n';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  DocsService,
  useLiveData,
  useService,
  useServices,
} from '@toeverything/infra';
import { Fragment, useCallback, useMemo } from 'react';

import { CollectionSidebarNavItem } from '../collections';
import type { FavoriteListProps } from '../index';
import { AddFavouriteButton } from './add-favourite-button';
import EmptyItem from './empty-item';
import { FavouriteDocSidebarNavItem } from './favourite-nav-item';
import * as styles from './styles.css';

const FavoriteListInner = ({ docCollection: workspace }: FavoriteListProps) => {
  const { favoriteItemsAdapter, docsService, collectionService } = useServices({
    FavoriteItemsAdapter,
    DocsService,
    CollectionService,
  });
  const collections = useLiveData(collectionService.collections$);
  const docs = useLiveData(docsService.list.docs$);
  const trashDocs = useLiveData(docsService.list.trashDocs$);
  const dropItemId = getDNDId('sidebar-pin', 'container', workspace.id);

  const favourites = useLiveData(
    favoriteItemsAdapter.orderedFavorites$.map(favs => {
      return favs.filter(fav => {
        if (fav.type === 'doc') {
          return (
            docs.some(doc => doc.id === fav.id) &&
            !trashDocs.some(doc => doc.id === fav.id)
          );
        }
        return true;
      });
    })
  );

  // disable drop styles when dragging from the pin list
  const { active } = useDndContext();

  const { setNodeRef, over } = useDroppable({
    id: dropItemId,
  });

  const intent = resolveDragEndIntent(active, over);
  const shouldRenderDragOver = intent === 'pin:add';

  const renderFavItem = useCallback(
    (item: WorkspaceFavoriteItem) => {
      if (item.type === 'collection') {
        const collection = collections.find(c => c.id === item.id);
        if (collection) {
          const dragItemId = getDNDId(
            'sidebar-pin',
            'collection',
            collection.id
          );
          return (
            <CollectionSidebarNavItem
              dndId={dragItemId}
              className={styles.favItemWrapper}
              docCollection={workspace}
              collection={collection}
            />
          );
        }
      } else if (item.type === 'doc') {
        return (
          <FavouriteDocSidebarNavItem
            docId={item.id}
            // memo?
          />
        );
      }
      return null;
    },
    [collections, workspace]
  );

  const t = useI18n();

  return (
    <div
      className={styles.favoriteList}
      data-testid="favourites"
      ref={setNodeRef}
      data-over={shouldRenderDragOver}
    >
      <CategoryDivider label={t['com.affine.rootAppSidebar.favorites']()}>
        <AddFavouriteButton />
      </CategoryDivider>
      {favourites.map(item => {
        return <Fragment key={item.id}>{renderFavItem(item)}</Fragment>;
      })}
      {favourites.length === 0 && <EmptyItem />}
    </div>
  );
};

export const FavoriteList = ({
  docCollection: workspace,
}: FavoriteListProps) => {
  const favAdapter = useService(FavoriteItemsAdapter);
  const favourites = useLiveData(favAdapter.orderedFavorites$);
  const sortItems = useMemo(() => {
    return favourites.map(fav => getDNDId('sidebar-pin', fav.type, fav.id));
  }, [favourites]);
  return (
    <SortableContext items={sortItems} strategy={verticalListSortingStrategy}>
      <FavoriteListInner docCollection={workspace} />
    </SortableContext>
  );
};

export default FavoriteList;
