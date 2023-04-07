import { DebugLogger } from '@affine/debug';
import { jotaiWorkspacesAtom } from '@affine/workspace/atom';
import { useAtomValue } from 'jotai';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import React, { Suspense, useEffect } from 'react';

import { workspaceByIdAtomFamily } from '../atoms';
import { PageLoading } from '../components/pure/loading';
import { useLastWorkspaceId } from '../hooks/affine/use-last-leave-workspace-id';
import { useCreateFirstWorkspace } from '../hooks/use-create-first-workspace';
import { RouteLogic, useRouterHelper } from '../hooks/use-router-helper';
import { WorkspaceSubPath } from '../shared';

const logger = new DebugLogger('IndexPage');

const IndexPageInner = () => {
  const router = useRouter();
  const { jumpToPage, jumpToSubPath } = useRouterHelper(router);
  const workspaces = useAtomValue(jotaiWorkspacesAtom);
  const lastWorkspaceId = useLastWorkspaceId();
  const targetWorkspace = useAtomValue(
    workspaceByIdAtomFamily(lastWorkspaceId ?? workspaces.at(0)?.id)
  );

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

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
  }, [
    jumpToPage,
    jumpToSubPath,
    lastWorkspaceId,
    router,
    targetWorkspace,
    workspaces,
  ]);

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
