import {
  TagPageListHeader,
  useTagMetas,
  VirtualizedPageList,
} from '@affine/core/components/page-list';
import { useBlockSuiteDocMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import {
  ViewBodyIsland,
  ViewHeaderIsland,
} from '@affine/core/modules/workbench';
import { useService } from '@toeverything/infra';
import { Workspace } from '@toeverything/infra';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { PageNotFound } from '../../404';
import { EmptyPageList } from '../page-list-empty';
import { TagDetailHeader } from './header';
import * as styles from './index.css';

export const TagDetail = ({ tagId }: { tagId?: string }) => {
  const currentWorkspace = useService(Workspace);
  const pageMetas = useBlockSuiteDocMeta(currentWorkspace.blockSuiteWorkspace);

  const { tags, filterPageMetaByTag } = useTagMetas(pageMetas);
  const tagPageMetas = useMemo(() => {
    if (tagId) {
      return filterPageMetaByTag(tagId);
    }
    return [];
  }, [filterPageMetaByTag, tagId]);

  const currentTag = useMemo(
    () => tags.find(tag => tag.id === tagId),
    [tagId, tags]
  );

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
          {tagPageMetas.length > 0 ? (
            <VirtualizedPageList tag={currentTag} listItem={tagPageMetas} />
          ) : (
            <EmptyPageList
              type="all"
              heading={
                <TagPageListHeader
                  tag={currentTag}
                  workspaceId={currentWorkspace.id}
                />
              }
              blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
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
