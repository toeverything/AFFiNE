import { NextPage } from 'next';
import { useRouter } from 'next/router';
import React, { Suspense, useEffect } from 'react';

import { PageLoading } from '../components/pure/loading';
import { useCreateFirstWorkspace } from '../hooks/use-create-first-workspace';
import { RouteLogic, useRouterHelper } from '../hooks/use-router-helper';
import { useWorkspaces } from '../hooks/use-workspaces';
import { WorkspaceSubPath } from '../shared';

const IndexPageInner = () => {
  const router = useRouter();
  const { jumpToPage, jumpToSubPath } = useRouterHelper(router);
  const workspaces = useWorkspaces();
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const firstWorkspace = workspaces.at(0);
    if (firstWorkspace) {
      const pageId =
        firstWorkspace.blockSuiteWorkspace.meta.pageMetas.at(0)?.id;
      if (pageId) {
        jumpToPage(firstWorkspace.id, pageId, RouteLogic.REPLACE);
        return;
      } else {
        const clearId = setTimeout(() => {
          dispose.dispose();
          jumpToSubPath(
            firstWorkspace.id,
            WorkspaceSubPath.ALL,
            RouteLogic.REPLACE
          );
        }, 1000);
        const dispose = firstWorkspace.blockSuiteWorkspace.slots.pageAdded.once(
          pageId => {
            clearTimeout(clearId);
            jumpToPage(firstWorkspace.id, pageId, RouteLogic.REPLACE);
          }
        );
        return () => {
          clearTimeout(clearId);
          dispose.dispose();
        };
      }
    }
  }, [router, workspaces]);
  return <PageLoading />;
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
