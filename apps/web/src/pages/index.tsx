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
    if (workspaceId && workspaces.find(w => w.id === workspaceId)) {
      router.replace({
        pathname: '/workspace/[workspaceId]/all',
        query: {
          workspaceId,
        },
      });
      return;
    }
    if (workspaces.at(0)) {
      router.replace({
        pathname: '/workspace/[workspaceId]/all',
        query: {
          workspaceId: workspaces[0].id,
        },
      });
      return;
    }
  }, [router, workspaceId, workspaces]);
  return <PageLoading />;
};

export default IndexPage;
