import { notify, useThemeColorV2 } from '@affine/component';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { CollectionService } from '@affine/core/modules/collection';
import { WorkspaceSubPath } from '@affine/core/shared';
import {
  GlobalContextService,
  useLiveData,
  useServices,
  WorkspaceService,
} from '@toeverything/infra';
import { useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';

import { AppTabs } from '../../../components';
import { CollectionDetail } from '../../../views';

export const Component = () => {
  useThemeColorV2('layer/background/secondary');
  const { collectionService, globalContextService, workspaceService } =
    useServices({
      WorkspaceService,
      CollectionService,
      GlobalContextService,
    });

  const globalContext = globalContextService.globalContext;
  const collections = useLiveData(collectionService.collections$);
  const params = useParams();
  const navigate = useNavigateHelper();
  const workspace = workspaceService.workspace;
  const collection = collections.find(v => v.id === params.collectionId);

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

  const notifyCollectionDeleted = useCallback(() => {
    navigate.jumpToSubPath(workspace.id, WorkspaceSubPath.HOME);
    const collection = collectionService.collectionsTrash$.value.find(
      v => v.collection.id === params.collectionId
    );
    let text = 'Collection does not exist';
    if (collection) {
      if (collection.userId) {
        text = `${collection.collection.name} has been deleted by ${collection.userName}`;
      } else {
        text = `${collection.collection.name} has been deleted`;
      }
    }
    return notify.error({ title: text });
  }, [collectionService, navigate, params.collectionId, workspace.id]);

  useEffect(() => {
    if (!collection) {
      notifyCollectionDeleted();
    }
  }, [collection, notifyCollectionDeleted]);

  if (!collection) {
    return null;
  }

  return (
    <>
      <CollectionDetail collection={collection} />
      <AppTabs />
    </>
  );
};
