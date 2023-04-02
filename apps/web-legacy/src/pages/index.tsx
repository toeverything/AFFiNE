import { DebugLogger } from '@affine/debug';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import React, { Suspense, useEffect } from 'react';

import { PageLoading } from '../components/pure/loading';
import { useLastWorkspaceId } from '../hooks/affine/use-last-leave-workspace-id';
import { useCreateFirstWorkspace } from '../hooks/use-create-first-workspace';
import { RouteLogic, useRouterHelper } from '../hooks/use-router-helper';
import { useWorkspaces } from '../hooks/use-workspaces';
import { WorkspaceSubPath } from '../shared';

const logger = new DebugLogger('IndexPage');

const IndexPageInner = () => {
  const router = useRouter();
  const { jumpToPage, jumpToSubPath } = useRouterHelper(router);
  const workspaces = useWorkspaces();
  const lastWorkspaceId = useLastWorkspaceId();

  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const targetWorkspace =
      (lastWorkspaceId &&
        workspaces.find(({ id }) => id === lastWorkspaceId)) ||
      workspaces.at(0);

    if (targetWorkspace) {
      const pageId =
        targetWorkspace.blockSuiteWorkspace.meta.pageMetas.at(0)?.id;
      if (pageId) {
        logger.debug('Found target workspace. Jump to page', pageId);
        jumpToPage(targetWorkspace.id, pageId, RouteLogic.REPLACE);
        return;
      } else {
        const clearId = setTimeout(() => {
          dispose.dispose();
          logger.debug('Found target workspace. Jump to all pages');
          jumpToSubPath(
            targetWorkspace.id,
            WorkspaceSubPath.ALL,
            RouteLogic.REPLACE
          );
        }, 1000);
        const dispose =
          targetWorkspace.blockSuiteWorkspace.slots.pageAdded.once(pageId => {
            clearTimeout(clearId);
            jumpToPage(targetWorkspace.id, pageId, RouteLogic.REPLACE);
          });
        return () => {
          clearTimeout(clearId);
          dispose.dispose();
        };
      }
    } else {
      logger.debug('No target workspace. jump to all pages');
      // fixme: should create new workspace
      jumpToSubPath('ERROR', WorkspaceSubPath.ALL, RouteLogic.REPLACE);
    }
  }, [jumpToPage, jumpToSubPath, lastWorkspaceId, router, workspaces]);

  return <PageLoading key="IndexPageInfinitePageLoading" />;
};

const IndexPage: NextPage = () => {
  useCreateFirstWorkspace();
  return (
    <Suspense fallback={<PageLoading />}>
      <IndexPageInner />
    </Suspense>
  );
};

export default IndexPage;
