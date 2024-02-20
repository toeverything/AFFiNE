import type { AllPageFilterOption } from '@affine/core/atoms';
import { HubIsland } from '@affine/core/components/affine/hub-island';
import {
  CollectionListHeader,
  type CollectionMeta,
  createEmptyCollection,
  currentCollectionAtom,
  PageListHeader,
  useCollectionManager,
  useEditCollectionName,
  useFilteredPageMetas,
  useTagMetas,
  VirtualizedCollectionList,
  VirtualizedPageList,
} from '@affine/core/components/page-list';
import {
  TagListHeader,
  VirtualizedTagList,
} from '@affine/core/components/page-list/tags';
import { useAllPageListConfig } from '@affine/core/hooks/affine/use-all-page-list-config';
import { useBlockSuitePageMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { performanceRenderLogger } from '@affine/core/shared';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useService } from '@toeverything/infra';
import { useLiveData } from '@toeverything/infra';
import { Workspace } from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { NIL } from 'uuid';

import { CollectionService } from '../../../modules/collection';
import {
  EmptyCollectionList,
  EmptyPageList,
  EmptyTagList,
} from '../page-list-empty';
import * as styles from './all-page.css';
import { AllPageHeader } from './all-page-header';

// even though it is called all page, it is also being used for collection route as well
export const AllPage = ({
  activeFilter,
}: {
  activeFilter: AllPageFilterOption;
}) => {
  const t = useAFFiNEI18N();
  const params = useParams();
  const currentWorkspace = useService(Workspace);
  const pageMetas = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);
  const [hideHeaderCreateNew, setHideHeaderCreateNew] = useState(true);

  const collectionService = useService(CollectionService);
  const collections = useLiveData(collectionService.collections);
  const setting = useCollectionManager(collectionService);
  const config = useAllPageListConfig();
  const { tags, tagMetas, filterPageMetaByTag, deleteTags } = useTagMetas(
    currentWorkspace.blockSuiteWorkspace,
    pageMetas
  );
  const filteredPageMetas = useFilteredPageMetas(
    'all',
    pageMetas,
    currentWorkspace.blockSuiteWorkspace
  );
  const tagPageMetas = useMemo(() => {
    if (params.tagId) {
      return filterPageMetaByTag(params.tagId);
    }
    return [];
  }, [filterPageMetaByTag, params.tagId]);

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
        setting.createCollection(createEmptyCollection(id, { name }));
        navigateHelper.jumpToCollection(currentWorkspace.id, id);
      })
      .catch(err => {
        console.error(err);
      });
  }, [currentWorkspace.id, navigateHelper, open, setting]);

  const currentTag = useMemo(() => {
    if (params.tagId) {
      return tags.find(tag => tag.id === params.tagId);
    }
    return;
  }, [params.tagId, tags]);

  const content = useMemo(() => {
    if (filteredPageMetas.length > 0 && activeFilter === 'docs') {
      return (
        <VirtualizedPageList
          setHideHeaderCreateNewPage={setHideHeaderCreateNew}
        />
      );
    } else if (activeFilter === 'collections' && !setting.isDefault) {
      return (
        <VirtualizedPageList
          collection={setting.currentCollection}
          config={config}
          setHideHeaderCreateNewPage={setHideHeaderCreateNew}
        />
      );
    } else if (activeFilter === 'collections' && setting.isDefault) {
      return collectionMetas.length > 0 ? (
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
      );
    } else if (activeFilter === 'tags') {
      if (params.tagId) {
        return tagPageMetas.length > 0 ? (
          <VirtualizedPageList
            tag={currentTag}
            listItem={tagPageMetas}
            setHideHeaderCreateNewPage={setHideHeaderCreateNew}
          />
        ) : (
          <EmptyPageList
            type="all"
            heading={<PageListHeader workspaceId={currentWorkspace.id} />}
            blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
          />
        );
      }
      return tags.length > 0 ? (
        <VirtualizedTagList
          tags={tags}
          tagMetas={tagMetas}
          setHideHeaderCreateNewTag={setHideHeaderCreateNew}
          onTagDelete={deleteTags}
        />
      ) : (
        <EmptyTagList heading={<TagListHeader />} />
      );
    }
    return (
      <EmptyPageList
        type="all"
        heading={<PageListHeader workspaceId={currentWorkspace.id} />}
        blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
      />
    );
  }, [
    activeFilter,
    collectionMetas,
    collections,
    config,
    currentTag,
    currentWorkspace.blockSuiteWorkspace,
    currentWorkspace.id,
    deleteTags,
    filteredPageMetas.length,
    handleCreateCollection,
    node,
    params.tagId,
    setting.currentCollection,
    setting.isDefault,
    tagMetas,
    tagPageMetas,
    tags,
  ]);

  return (
    <div className={styles.root}>
      <AllPageHeader
        workspace={currentWorkspace.blockSuiteWorkspace}
        showCreateNew={!hideHeaderCreateNew}
        isDefaultFilter={setting.isDefault}
        activeFilter={activeFilter}
        onCreateCollection={handleCreateCollection}
      />
      {content}
      <HubIsland />
    </div>
  );
};

export const Component = () => {
  performanceRenderLogger.info('AllPage');

  const currentWorkspace = useService(Workspace);
  const currentCollection = useSetAtom(currentCollectionAtom);
  const navigateHelper = useNavigateHelper();

  const location = useLocation();
  const activeFilter = useMemo(() => {
    const query = new URLSearchParams(location.search);
    const filterMode = query.get('filterMode');
    if (filterMode === 'collections') {
      return 'collections';
    } else if (filterMode === 'tags') {
      return 'tags';
    }
    return 'docs';
  }, [location.search]);

  useEffect(() => {
    function checkJumpOnce() {
      for (const [pageId] of currentWorkspace.blockSuiteWorkspace.pages) {
        const page = currentWorkspace.blockSuiteWorkspace.getPage(pageId);
        if (page && page.meta.jumpOnce) {
          currentWorkspace.blockSuiteWorkspace.meta.setPageMeta(page.id, {
            jumpOnce: false,
          });
          navigateHelper.jumpToPage(currentWorkspace.id, pageId);
        }
      }
    }
    checkJumpOnce();
    return currentWorkspace.blockSuiteWorkspace.slots.pagesUpdated.on(
      checkJumpOnce
    ).dispose;
  }, [
    currentWorkspace.blockSuiteWorkspace,
    currentWorkspace.id,
    navigateHelper,
  ]);

  useEffect(() => {
    currentCollection(NIL);
  }, [currentCollection]);

  return <AllPage activeFilter={activeFilter} />;
};
