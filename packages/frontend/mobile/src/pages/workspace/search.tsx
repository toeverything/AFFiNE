import { SafeArea, useThemeColorV2 } from '@affine/component';
import { CollectionService } from '@affine/core/modules/collection';
import {
  type QuickSearchItem,
  QuickSearchTagIcon,
} from '@affine/core/modules/quicksearch';
import { TagService } from '@affine/core/modules/tag';
import { ViewLayersIcon } from '@blocksuite/icons/rc';
import {
  LiveData,
  useLiveData,
  useService,
  useServices,
} from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { AppTabs, SearchInput, SearchResLabel } from '../../components';
import { MobileSearchService } from '../../modules/search';
import { SearchResults } from '../../views/search/search-results';
import * as styles from '../../views/search/style.css';

const searchInput$ = new LiveData('');

const RecentList = () => {
  const { mobileSearchService, collectionService, tagService } = useServices({
    MobileSearchService,
    CollectionService,
    TagService,
  });
  const recentDocsList = useLiveData(mobileSearchService.recentDocs.items$);
  const collections = useLiveData(collectionService.collections$);
  const tags = useLiveData(
    LiveData.computed(get =>
      get(tagService.tagList.tags$).map(tag => ({
        id: tag.id,
        title: get(tag.value$),
        color: get(tag.color$),
      }))
    )
  );

  const docs = useMemo(
    () =>
      recentDocsList.map(item => ({
        id: item.payload.docId,
        icon: item.icon,
        title: <SearchResLabel item={item} />,
      })),
    [recentDocsList]
  );

  const collectionList = useMemo(() => {
    return collections.slice(0, 3).map(item => {
      return {
        id: 'collection:' + item.id,
        source: 'collection',
        label: { title: item.name },
        icon: <ViewLayersIcon />,
        payload: { collectionId: item.id },
      } satisfies QuickSearchItem<'collection', { collectionId: string }>;
    });
  }, [collections]);

  const tagList = useMemo(() => {
    return tags
      .reverse()
      .slice(0, 3)
      .map(item => {
        return {
          id: 'tag:' + item.id,
          source: 'tag',
          label: { title: item.title },
          icon: <QuickSearchTagIcon color={item.color} />,
          payload: { tagId: item.id },
        } satisfies QuickSearchItem<'tag', { tagId: string }>;
      });
  }, [tags]);

  return (
    <SearchResults
      title="Recent"
      docs={docs}
      collections={collectionList}
      tags={tagList}
    />
  );
};

const WithQueryList = () => {
  const searchService = useService(MobileSearchService);
  const collectionList = useLiveData(searchService.collections.items$);
  const docList = useLiveData(searchService.docs.items$);
  const tagList = useLiveData(searchService.tags.items$);

  const docs = useMemo(
    () =>
      docList.map(item => ({
        id: item.payload.docId,
        icon: item.icon,
        title: <SearchResLabel item={item} />,
      })),
    [docList]
  );

  return (
    <SearchResults
      title="Search result"
      docs={docs}
      collections={collectionList}
      tags={tagList}
    />
  );
};

export const Component = () => {
  useThemeColorV2('layer/background/secondary');
  const searchInput = useLiveData(searchInput$);
  const searchService = useService(MobileSearchService);

  const onSearch = useCallback(
    (v: string) => {
      searchInput$.next(v);
      searchService.recentDocs.query(v);
      searchService.collections.query(v);
      searchService.docs.query(v);
      searchService.tags.query(v);
    },
    [
      searchService.collections,
      searchService.docs,
      searchService.recentDocs,
      searchService.tags,
    ]
  );

  return (
    <>
      <SafeArea top>
        <div className={styles.searchHeader} data-testid="search-header">
          <SearchInput
            debounce={300}
            autoFocus={!searchInput}
            value={searchInput}
            onInput={onSearch}
            placeholder="Search Docs, Collections"
          />
        </div>
      </SafeArea>
      {searchInput ? <WithQueryList /> : <RecentList />}
      <AppTabs />
    </>
  );
};
