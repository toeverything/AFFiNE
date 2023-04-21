import { DebugLogger } from '@affine/debug';
import { useTranslation } from '@affine/i18n';
import { WorkspaceFlavour } from '@affine/workspace/type';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { Suspense, useEffect } from 'react';

import { PageLoading } from '../components/pure/loading';
import { useLastWorkspaceId } from '../hooks/affine/use-last-leave-workspace-id';
import { RouteLogic, useRouterHelper } from '../hooks/use-router-helper';
import { useAppHelper, useWorkspaces } from '../hooks/use-workspaces';
import { WorkspaceSubPath } from '../shared';

const logger = new DebugLogger('index-page');

const IndexPageInner = () => {
  const router = useRouter();
  const { jumpToPage, jumpToSubPath } = useRouterHelper(router);
  const workspaces = useWorkspaces();
  const lastWorkspaceId = useLastWorkspaceId();
  const helper = useAppHelper();

  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const targetWorkspace =
      (lastWorkspaceId &&
        workspaces.find(({ id }) => id === lastWorkspaceId)) ||
      // fixme(himself65):
      //  when affine workspace is expired and the first workspace is affine,
      //  the page will crash
      workspaces.find(({ flavour }) => flavour === WorkspaceFlavour.LOCAL);

    if (targetWorkspace) {
      const pageId =
        targetWorkspace.blockSuiteWorkspace.meta.pageMetas.at(0)?.id;
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
  }, [helper, jumpToPage, jumpToSubPath, lastWorkspaceId, router, workspaces]);

  return <PageLoading key="IndexPageInfinitePageLoading" />;
};

const IndexPage: NextPage = () => {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<PageLoading text={t('Loading All Workspaces')} />}>
      <IndexPageInner />
    </Suspense>
  );
};

export default IndexPage;
