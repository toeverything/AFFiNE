import {
  TagPageListHeader,
  VirtualizedPageList,
} from '@affine/core/components/page-list';
import { useBlockSuiteDocMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { TagService } from '@affine/core/modules/tag';
import {
  useIsActiveView,
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
} from '@affine/core/modules/workbench';
import {
  GlobalContextService,
  useLiveData,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { PageNotFound } from '../../404';
import { EmptyPageList } from '../page-list-empty';
import { TagDetailHeader } from './header';
import * as styles from './index.css';

export const TagDetail = ({ tagId }: { tagId?: string }) => {
  const globalContext = useService(GlobalContextService).globalContext;
  const currentWorkspace = useService(WorkspaceService).workspace;
  const pageMetas = useBlockSuiteDocMeta(currentWorkspace.docCollection);

  const tagList = useService(TagService).tagList;
  const currentTag = useLiveData(tagList.tagByTagId$(tagId));

  const pageIds = useLiveData(currentTag?.pageIds$);

  const filteredPageMetas = useMemo(() => {
    const pageIdsSet = new Set(pageIds);
    return pageMetas.filter(page => pageIdsSet.has(page.id));
  }, [pageIds, pageMetas]);

  const isActiveView = useIsActiveView();
  const tagName = useLiveData(currentTag?.value$);

  useEffect(() => {
    if (isActiveView && currentTag) {
      globalContext.tagId.set(currentTag.id);
      globalContext.isTag.set(true);

      return () => {
        globalContext.tagId.set(null);
        globalContext.isTag.set(false);
      };
    }
    return;
  }, [currentTag, globalContext, isActiveView]);

  if (!currentTag) {
    return <PageNotFound />;
  }

  return (
    <>
      <ViewTitle title={tagName ?? 'Untitled'} />
      <ViewIcon icon="tag" />
      <ViewHeader>
        <TagDetailHeader />
      </ViewHeader>
      <ViewBody>
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
      </ViewBody>
    </>
  );
};

export const Component = () => {
  const params = useParams();

  return <TagDetail tagId={params.tagId} />;
};
