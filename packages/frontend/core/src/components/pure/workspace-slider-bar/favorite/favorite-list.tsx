import { useBlockSuiteDocMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { FavoriteItemsAdapter } from '@affine/core/modules/workspace';
import type { DocMeta } from '@blocksuite/store';
import { useDroppable } from '@dnd-kit/core';
import { useLiveData, useService } from '@toeverything/infra';
import { useMemo } from 'react';

import { getDropItemId } from '../../../../hooks/affine/use-sidebar-drag';
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
  const dropItemId = getDropItemId('favorites');

  const favourites = useLiveData(
    favAdapter.favorites$.map(favourites =>
      favourites.filter(fav => {
        const meta = metas.find(m => m.id === fav.id);
        return meta && !meta.trash;
      })
    )
  );

  const metaMapping = useMemo(
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
      {favourites.map((pageMeta, index) => {
        return (
          <FavouritePage
            key={`${pageMeta}-${index}`}
            metaMapping={metaMapping}
            pageId={pageMeta.id}
            // memo?
            parentIds={emptyPageIdSet}
            docCollection={workspace}
          />
        );
      })}
      {favourites.length === 0 && <EmptyItem />}
    </div>
  );
};

export default FavoriteList;
