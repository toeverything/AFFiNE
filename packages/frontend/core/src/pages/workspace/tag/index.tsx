import {
  TagPageListHeader,
  VirtualizedPageList,
} from '@affine/core/components/page-list';
import { useBlockSuiteDocMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { TagService } from '@affine/core/modules/tag';
import {
  ViewBodyIsland,
  ViewHeaderIsland,
} from '@affine/core/modules/workbench';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import { Workspace } from '@toeverything/infra';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { PageNotFound } from '../../404';
import { EmptyPageList } from '../page-list-empty';
import { TagDetailHeader } from './header';
import * as styles from './index.css';

export const TagDetail = ({ tagId }: { tagId?: string }) => {
  const currentWorkspace = useService(Workspace);
  const pageMetas = useBlockSuiteDocMeta(currentWorkspace.docCollection);

  const tagService = useService(TagService);
  const currentTagLiveData = tagService.tagByTagId(tagId);
  const currentTag = useLiveData(currentTagLiveData);

  const pageIdsLiveData = useMemo(
    () =>
      LiveData.computed(get => {
        const liveTag = get(currentTagLiveData);
        if (liveTag?.pageIds) {
          return get(liveTag.pageIds);
        }
        return [];
      }),
    [currentTagLiveData]
  );
  const pageIds = useLiveData(pageIdsLiveData);

  const filteredPageMetas = useMemo(() => {
    const pageIdsSet = new Set(pageIds);
    return pageMetas.filter(page => pageIdsSet.has(page.id));
  }, [pageIds, pageMetas]);

  if (!currentTag) {
    return <PageNotFound />;
  }

  return (
    <>
      <ViewHeaderIsland>
        <TagDetailHeader />
      </ViewHeaderIsland>
      <ViewBodyIsland>
        <div className={styles.body}>
          {filteredPageMetas.length > 0 ? (
            <VirtualizedPageList
              tag={currentTag}
              listItem={filteredPageMetas}
            />
          ) : (
            <EmptyPageList
              type="all"
              heading={
                <TagPageListHeader
                  tag={currentTag}
                  workspaceId={currentWorkspace.id}
                />
              }
              docCollection={currentWorkspace.docCollection}
            />
          )}
        </div>
      </ViewBodyIsland>
    </>
  );
};

export const Component = () => {
  const params = useParams();

  return <TagDetail tagId={params.tagId} />;
};
