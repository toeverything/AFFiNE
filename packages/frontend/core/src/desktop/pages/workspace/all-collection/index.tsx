import { usePromptModal } from '@affine/component';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import type { CollectionMeta } from '@affine/core/components/page-list';
import {
  CollectionListHeader,
  createEmptyCollection,
  VirtualizedCollectionList,
} from '@affine/core/components/page-list';
import {
  ViewIcon,
  ViewTitle,
} from '@affine/core/modules/workbench/view/view-meta';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useCallback, useMemo, useState } from 'react';

import { CollectionService } from '../../../../modules/collection';
import { ViewBody, ViewHeader } from '../../../../modules/workbench';
import { AllDocSidebarTabs } from '../layouts/all-doc-sidebar-tabs';
import { EmptyCollectionList } from '../page-list-empty';
import { AllCollectionHeader } from './header';
import * as styles from './index.css';

export const AllCollection = () => {
  const t = useI18n();
  const currentWorkspace = useService(WorkspaceService).workspace;
  const [hideHeaderCreateNew, setHideHeaderCreateNew] = useState(true);

  const collectionService = useService(CollectionService);
  const collections = useLiveData(collectionService.collections$);

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
  const { openPromptModal } = usePromptModal();

  const handleCreateCollection = useCallback(() => {
    openPromptModal({
      title: t['com.affine.editCollection.saveCollection'](),
      label: t['com.affine.editCollectionName.name'](),
      inputOptions: {
        placeholder: t['com.affine.editCollectionName.name.placeholder'](),
      },
      children: (
        <div className={styles.createTips}>
          {t['com.affine.editCollectionName.createTips']()}
        </div>
      ),
      confirmText: t['com.affine.editCollection.save'](),
      cancelText: t['com.affine.editCollection.button.cancel'](),
      confirmButtonOptions: {
        variant: 'primary',
      },
      onConfirm(name) {
        const id = nanoid();
        collectionService.addCollection(createEmptyCollection(id, { name }));
        navigateHelper.jumpToCollection(currentWorkspace.id, id);
      },
    });
  }, [
    collectionService,
    currentWorkspace.id,
    navigateHelper,
    openPromptModal,
    t,
  ]);

  return (
    <>
      <ViewTitle title={t['Collections']()} />
      <ViewIcon icon="collection" />
      <ViewHeader>
        <AllCollectionHeader
          showCreateNew={!hideHeaderCreateNew}
          onCreateCollection={handleCreateCollection}
        />
      </ViewHeader>
      <ViewBody>
        <div className={styles.body}>
          {collectionMetas.length > 0 ? (
            <VirtualizedCollectionList
              collections={collections}
              collectionMetas={collectionMetas}
              setHideHeaderCreateNewCollection={setHideHeaderCreateNew}
              handleCreateCollection={handleCreateCollection}
            />
          ) : (
            <EmptyCollectionList
              heading={
                <CollectionListHeader onCreate={handleCreateCollection} />
              }
            />
          )}
        </div>
      </ViewBody>
      <AllDocSidebarTabs />
    </>
  );
};

export const Component = () => {
  return <AllCollection />;
};
