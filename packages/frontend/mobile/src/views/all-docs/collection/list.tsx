import { EmptyCollections } from '@affine/core/components/affine/empty';
import type { CollectionMeta } from '@affine/core/components/page-list';
import { CollectionService } from '@affine/core/modules/collection';
import { useLiveData, useService } from '@toeverything/infra';
import { useMemo } from 'react';

import { CollectionListItem } from './item';
import { list } from './styles.css';

export const CollectionList = () => {
  const collectionService = useService(CollectionService);
  const collections = useLiveData(collectionService.collections$);

  const collectionMetas = useMemo(
    () =>
      collections.map(
        collection =>
          ({ ...collection, title: collection.name }) satisfies CollectionMeta
      ),
    [collections]
  );

  if (!collectionMetas.length) {
    return <EmptyCollections absoluteCenter />;
  }

  return (
    <ul className={list}>
      {collectionMetas.map(meta => (
        <CollectionListItem key={meta.id} meta={meta} />
      ))}
    </ul>
  );
};
