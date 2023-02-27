import { useAtom } from 'jotai';
import { useHydrateAtoms } from 'jotai/utils';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import React, { useEffect } from 'react';

import {
  currentWorkspaceAtomFromServer,
  currentWorkspaceIdAtom,
} from '../atoms';
import { PageLoading } from '../components/pure/loading';
import { prefetchNecessaryData, useWorkspaces } from '../hooks/use-workspaces';

prefetchNecessaryData();
const IndexPage: NextPage = () => {
  const router = useRouter();
  useHydrateAtoms([[currentWorkspaceIdAtom, currentWorkspaceAtomFromServer]]);
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
