import { useThemeColorV2 } from '@affine/component';
import { CollectionService } from '@affine/core/modules/collection';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { useLiveData, useServices } from '@toeverything/infra';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

import { CollectionDetail } from '../../../views';

export const Component = () => {
  useThemeColorV2('layer/background/mobile/primary');
  const { collectionService, globalContextService } = useServices({
    CollectionService,
    GlobalContextService,
  });

  const globalContext = globalContextService.globalContext;
  const params = useParams();
  const collection = useLiveData(
    params.collectionId
      ? collectionService.collection$(params.collectionId)
      : null
  );

  useEffect(() => {
    if (collection) {
      globalContext.collectionId.set(collection.id);
      globalContext.isCollection.set(true);

      return () => {
        globalContext.collectionId.set(null);
        globalContext.isCollection.set(false);
      };
    }
    return;
  }, [collection, globalContext]);

  if (!collection) {
    // TODO: implement 404 page
    return <div></div>;
  }

  return <CollectionDetail collection={collection} />;
};
