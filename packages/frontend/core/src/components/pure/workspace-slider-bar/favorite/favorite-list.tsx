import { useBlockSuiteDocMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { CollectionService } from '@affine/core/modules/collection';
import { FavoriteItemsAdapter } from '@affine/core/modules/workspace';
import type { DocMeta } from '@blocksuite/store';
import { useDroppable } from '@dnd-kit/core';
import { useLiveData, useService } from '@toeverything/infra';
import { useMemo } from 'react';

import { getDropItemId } from '../../../../hooks/affine/use-sidebar-drag';
import { CollectionSidebarNavItem } from '../collections';
import type { FavoriteListProps } from '../index';
import EmptyItem from './empty-item';
import { FavouritePage } from './favourite-page';
import * as styles from './styles.css';

const emptyPageIdSet = new Set<string>();

export const FavoriteList = ({
  docCollection: workspace,
}: FavoriteListProps) => {
  const metas = useBlockSuiteDocMeta(workspace);
  const favAdapter = useService(FavoriteItemsAdapter);
  const collections = useLiveData(useService(CollectionService).collections$);
  const dropItemId = getDropItemId('favorites');

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

  const { setNodeRef, isOver } = useDroppable({
    id: dropItemId,
  });

  return (
    <div
      className={styles.favoriteList}
      data-testid="favourites"
      ref={setNodeRef}
      data-over={isOver}
    >
      {favourites.map(item => {
        if (item.type === 'collection') {
          const collection = collections.find(c => c.id === item.id);
          if (collection) {
            return (
              <CollectionSidebarNavItem
                key={item.id}
                className={styles.favItemWrapper}
                docCollection={workspace}
                collection={collection}
              />
            );
          }
        } else if (item.type === 'doc' && !docMetaMapping[item.id].trash) {
          return (
            <FavouritePage
              key={item.id}
              metaMapping={docMetaMapping}
              pageId={item.id}
              // memo?
              parentIds={emptyPageIdSet}
              docCollection={workspace}
            />
          );
        }
        return null;
      })}
      {favourites.length === 0 && <EmptyItem />}
    </div>
  );
};

export default FavoriteList;
