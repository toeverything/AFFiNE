import {
  createDocExplorerContext,
  DocExplorerContext,
} from '@affine/core/components/explorer/context';
import { DocsExplorer } from '@affine/core/components/explorer/docs-view/docs-list';
import type { ExplorerDisplayPreference } from '@affine/core/components/explorer/types';
import { CollectionRulesService } from '@affine/core/modules/collection-rules';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { TagService } from '@affine/core/modules/tag';
import {
  useIsActiveView,
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
} from '@affine/core/modules/workbench';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { PageNotFound } from '../../404';
import { AllDocSidebarTabs } from '../layouts/all-doc-sidebar-tabs';
import { EmptyPageList } from '../page-list-empty';
import { TagDetailHeader } from './header';
import * as styles from './index.css';
import { TagListHeader } from './list-header';

export const TagDetail = ({ tagId }: { tagId?: string }) => {
  const [explorerContextValue] = useState(createDocExplorerContext);
  const collectionRulesService = useService(CollectionRulesService);
  const globalContext = useService(GlobalContextService).globalContext;
  const permissionService = useService(WorkspacePermissionService);
  const isAdmin = useLiveData(permissionService.permission.isAdmin$);
  const isOwner = useLiveData(permissionService.permission.isOwner$);

  const tagList = useService(TagService).tagList;
  const currentTag = useLiveData(tagList.tagByTagId$(tagId));

  const displayPreference = useLiveData(
    explorerContextValue.displayPreference$
  );
  const groupBy = useLiveData(explorerContextValue.groupBy$);
  const orderBy = useLiveData(explorerContextValue.orderBy$);
  const groups = useLiveData(explorerContextValue.groups$);

  const isEmpty =
    groups.length === 0 ||
    (groups.length && groups.every(group => group.items.length === 0));

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

  useEffect(() => {
    const subscription = collectionRulesService
      .watch({
        filters: [
          {
            type: 'system',
            key: 'empty-journal',
            method: 'is',
            value: 'false',
          },
          {
            type: 'system',
            key: 'trash',
            method: 'is',
            value: 'false',
          },
          {
            type: 'property',
            key: 'tags',
            method: 'include-all',
            value: tagId,
          },
        ],
        groupBy,
        orderBy,
      })
      .subscribe({
        next: result => {
          explorerContextValue.groups$.next(result.groups);
        },
        error: error => {
          console.error(error);
        },
      });
    return () => {
      subscription.unsubscribe();
    };
  }, [
    collectionRulesService,
    explorerContextValue.groups$,
    groupBy,
    orderBy,
    tagId,
  ]);

  const handleDisplayPreferenceChange = useCallback(
    (displayPreference: ExplorerDisplayPreference) => {
      explorerContextValue.displayPreference$.next(displayPreference);
    },
    [explorerContextValue]
  );

  if (!currentTag || !tagId) {
    return <PageNotFound />;
  }

  return (
    <DocExplorerContext.Provider value={explorerContextValue}>
      <ViewTitle title={tagName ?? 'Untitled'} />
      <ViewIcon icon="tag" />
      <ViewHeader>
        <TagDetailHeader
          displayPreference={displayPreference}
          onDisplayPreferenceChange={handleDisplayPreferenceChange}
        />
      </ViewHeader>
      <ViewBody>
        <div className={styles.body}>
          <TagListHeader tag={currentTag} />
          <div className={styles.scrollArea}>
            {isEmpty ? (
              <EmptyPageList type="all" tagId={tagId} />
            ) : (
              <DocsExplorer disableMultiDelete={!isAdmin && !isOwner} />
            )}
          </div>
        </div>
      </ViewBody>
    </DocExplorerContext.Provider>
  );
};

export const Component = () => {
  const params = useParams();

  return (
    <>
      <AllDocSidebarTabs />
      <TagDetail tagId={params.tagId} />
    </>
  );
};
