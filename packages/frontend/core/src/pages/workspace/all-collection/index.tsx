import { HubIsland } from '@affine/core/components/affine/hub-island';
import {
  CollectionListHeader,
  type CollectionMeta,
  createEmptyCollection,
  useEditCollectionName,
  VirtualizedCollectionList,
} from '@affine/core/components/page-list';
import { useAllPageListConfig } from '@affine/core/hooks/affine/use-all-page-list-config';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useService } from '@toeverything/infra';
import { useLiveData } from '@toeverything/infra';
import { Workspace } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useCallback, useMemo, useState } from 'react';

import { CollectionService } from '../../../modules/collection';
import * as styles from '../all-page/all-page.css';
import { EmptyCollectionList } from '../page-list-empty';
import { AllCollectionHeader } from './header';

export const AllCollection = () => {
  const t = useAFFiNEI18N();
  const currentWorkspace = useService(Workspace);
  const [hideHeaderCreateNew, setHideHeaderCreateNew] = useState(true);

  const collectionService = useService(CollectionService);
  const collections = useLiveData(collectionService.collections);
  const config = useAllPageListConfig();

  const collectionMetas = useMemo(() => {
    const collectionsList: CollectionMeta[] = collections.map(collection => {
      return {
        ...collection,
        title: collection.name,
      };
    });
    return collectionsList;
  }, [collections]);

  const navigateHelper = useNavigateHelper();
  const { open, node } = useEditCollectionName({
    title: t['com.affine.editCollection.createCollection'](),
    showTips: true,
  });

  const handleCreateCollection = useCallback(() => {
    open('')
      .then(name => {
        const id = nanoid();
        collectionService.addCollection(createEmptyCollection(id, { name }));
        navigateHelper.jumpToCollection(currentWorkspace.id, id);
      })
      .catch(err => {
        console.error(err);
      });
  }, [collectionService, currentWorkspace, navigateHelper, open]);

  return (
    <div className={styles.root}>
      <AllCollectionHeader
        showCreateNew={!hideHeaderCreateNew}
        onCreateCollection={handleCreateCollection}
      />
      {collectionMetas.length > 0 ? (
        <VirtualizedCollectionList
          collections={collections}
          collectionMetas={collectionMetas}
          setHideHeaderCreateNewCollection={setHideHeaderCreateNew}
          node={node}
          config={config}
          handleCreateCollection={handleCreateCollection}
        />
      ) : (
        <EmptyCollectionList
          heading={
            <CollectionListHeader
              node={node}
              onCreate={handleCreateCollection}
            />
          }
        />
      )}

      <HubIsland />
    </div>
  );
};

export const Component = () => {
  return <AllCollection />;
};
