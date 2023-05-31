import { WorkspaceFallback } from '@affine/component/workspace';
import { DebugLogger } from '@affine/debug';
import { WorkspaceSubPath } from '@affine/workspace/type';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { Suspense, useEffect } from 'react';

import { PageLoading } from '../components/pure/loading';
import { RouteLogic, useRouterHelper } from '../hooks/use-router-helper';
import { useAppHelper, useWorkspaces } from '../hooks/use-workspaces';
import { AllWorkspaceContext } from '../layouts/workspace-layout';
import { AllWorkspaceModals } from '../providers/modal-provider';

const logger = new DebugLogger('index-page');

const IndexPageInner = () => {
  const router = useRouter();
  const { jumpToPage, jumpToSubPath } = useRouterHelper(router);
  const workspaces = useWorkspaces();
  const helper = useAppHelper();

  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const lastId = localStorage.getItem('last_workspace_id');
    const lastPageId = localStorage.getItem('last_page_id');
    const targetWorkspace =
      (lastId && workspaces.find(({ id }) => id === lastId)) ||
      workspaces.at(0);

    if (targetWorkspace) {
      const nonTrashPages =
        targetWorkspace.blockSuiteWorkspace.meta.pageMetas.filter(
          ({ trash }) => !trash
        );
      const pageId =
        nonTrashPages.find(({ id }) => id === lastPageId)?.id ??
        nonTrashPages.at(0)?.id;
      if (pageId) {
        logger.debug('Found target workspace. Jump to page', pageId);
        void jumpToPage(targetWorkspace.id, pageId, RouteLogic.REPLACE);
      } else {
        const clearId = setTimeout(() => {
          dispose.dispose();
          logger.debug('Found target workspace. Jump to all pages');
          void jumpToSubPath(
            targetWorkspace.id,
            WorkspaceSubPath.ALL,
            RouteLogic.REPLACE
          );
        }, 1000);
        const dispose =
          targetWorkspace.blockSuiteWorkspace.slots.pageAdded.once(pageId => {
            clearTimeout(clearId);
            void jumpToPage(targetWorkspace.id, pageId, RouteLogic.REPLACE);
          });
        return () => {
          clearTimeout(clearId);
          dispose.dispose();
        };
      }
    } else {
      console.warn('No target workspace. This should not happen in production');
    }
  }, [helper, jumpToPage, jumpToSubPath, router, workspaces]);

  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <AllWorkspaceContext>
        <AllWorkspaceModals />
      </AllWorkspaceContext>
    </Suspense>
  );
};

const IndexPage: NextPage = () => {
  return (
    <Suspense fallback={<PageLoading />}>
      <IndexPageInner />
    </Suspense>
  );
};

export default IndexPage;
