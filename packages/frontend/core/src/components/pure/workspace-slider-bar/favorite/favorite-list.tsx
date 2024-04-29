import { CategoryDivider } from '@affine/core/components/app-sidebar';
import {
  getDNDId,
  resolveDragEndIntent,
} from '@affine/core/hooks/affine/use-global-dnd-helper';
import { useBlockSuiteDocMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { CollectionService } from '@affine/core/modules/collection';
import { FavoriteItemsAdapter } from '@affine/core/modules/properties';
import type { WorkspaceFavoriteItem } from '@affine/core/modules/properties/services/schema';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { DocMeta } from '@blocksuite/store';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useLiveData, useService } from '@toeverything/infra';
import { Fragment, useCallback, useMemo } from 'react';

import { CollectionSidebarNavItem } from '../collections';
import type { FavoriteListProps } from '../index';
import { AddFavouriteButton } from './add-favourite-button';
import EmptyItem from './empty-item';
import { FavouriteDocSidebarNavItem } from './favourite-nav-item';
import * as styles from './styles.css';

const FavoriteListInner = ({ docCollection: workspace }: FavoriteListProps) => {
  const metas = useBlockSuiteDocMeta(workspace);
  const favAdapter = useService(FavoriteItemsAdapter);
  const collections = useLiveData(useService(CollectionService).collections$);
  const dropItemId = getDNDId('sidebar-pin', 'container', workspace.id);

  const docMetaMapping = useMemo(
    () =>
      metas.reduce(
        (acc, meta) => {
          acc[meta.id] = meta;
          return acc;
        },
        {} as Record<string, DocMeta>
      ),
    [metas]
  );

  const favourites = useLiveData(
    favAdapter.orderedFavorites$.map(favs => {
      return favs.filter(fav => {
        if (fav.type === 'doc') {
          return !!docMetaMapping[fav.id] && !docMetaMapping[fav.id].trash;
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
      } else if (item.type === 'doc' && !docMetaMapping[item.id].trash) {
        return (
          <FavouriteDocSidebarNavItem
            metaMapping={docMetaMapping}
            pageId={item.id}
            // memo?
            docCollection={workspace}
          />
        );
      }
      return null;
    },
    [collections, docMetaMapping, workspace]
  );

  const t = useAFFiNEI18N();

  return (
    <div
      className={styles.favoriteList}
      data-testid="favourites"
      ref={setNodeRef}
      data-over={shouldRenderDragOver}
    >
      <CategoryDivider label={t['com.affine.rootAppSidebar.favorites']()}>
        <AddFavouriteButton docCollection={workspace} />
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
