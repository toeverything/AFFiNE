import { useAtom } from 'jotai';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import React, { useEffect } from 'react';

import { currentWorkspaceIdAtom } from '../atoms';
import { PageLoading } from '../components/pure/loading';
import { refreshDataCenter, useWorkspaces } from '../hooks/use-workspaces';

const IndexPage: NextPage = () => {
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    refreshDataCenter(controller.signal);
    return () => {
      controller.abort();
    };
  }, []);
  const [workspaceId] = useAtom(currentWorkspaceIdAtom);
  const workspaces = useWorkspaces();
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const targetWorkspace = workspaces.find(w => w.id === workspaceId);
    if (workspaceId && targetWorkspace) {
      const pageId =
        targetWorkspace.blockSuiteWorkspace.meta.pageMetas.at(0)?.id;
      if (pageId) {
        router.replace({
          pathname: '/workspace/[workspaceId]/[pageId]',
          query: {
            workspaceId,
            pageId,
          },
        });
        return;
      } else {
        router.replace({
          pathname: '/workspace/[workspaceId]/all',
          query: {
            workspaceId,
          },
        });
        return;
      }
    }
    const firstWorkspace = workspaces.at(0);
    if (firstWorkspace) {
      const pageId =
        firstWorkspace.blockSuiteWorkspace.meta.pageMetas.at(0)?.id;
      if (pageId) {
        router.replace({
          pathname: '/workspace/[workspaceId]/[pageId]',
          query: {
            workspaceId: firstWorkspace.id,
            pageId,
          },
        });
        return;
      } else {
        router.replace({
          pathname: '/workspace/[workspaceId]/all',
          query: {
            workspaceId: firstWorkspace.id,
          },
        });
        return;
      }
    }
  }, [router, workspaceId, workspaces]);
  return <PageLoading />;
};

export default IndexPage;
