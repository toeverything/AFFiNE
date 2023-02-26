import { NextPage } from 'next';
import { useRouter } from 'next/router';
import React, { useEffect } from 'react';

import { PageLoading } from '../components/pure/loading';
import { prefetchNecessaryData, useWorkspaces } from '../hooks/use-workspaces';

prefetchNecessaryData();
const IndexPage: NextPage = () => {
  const router = useRouter();
  const workspaces = useWorkspaces();
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    if (workspaces.at(0)) {
      router.replace({
        pathname: '/workspace/[workspaceId]/all',
        query: {
          workspaceId: workspaces[0].id,
        },
      });
    }
  }, [router, workspaces]);
  return <PageLoading />;
};

export default IndexPage;
