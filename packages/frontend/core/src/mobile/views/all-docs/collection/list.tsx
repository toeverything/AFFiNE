import { EmptyCollections } from '@affine/core/components/affine/empty';
import { CollectionService } from '@affine/core/modules/collection';
import { useLiveData, useService } from '@toeverything/infra';

import { CollectionListItem } from './item';
import { list } from './styles.css';

export const CollectionList = () => {
  const collectionService = useService(CollectionService);
  const collectionMetas = useLiveData(collectionService.collectionMetas$);

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
