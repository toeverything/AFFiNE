import { NextPage } from 'next';
import { useRouter } from 'next/router';
import React, { Suspense, useEffect } from 'react';

import { PageLoading } from '../components/pure/loading';
import { useCreateFirstWorkspace } from '../hooks/use-create-first-workspace';
import { useWorkspaces } from '../hooks/use-workspaces';

const IndexPageInner = () => {
  const router = useRouter();
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
        router.replace({
          pathname: '/workspace/[workspaceId]/[pageId]',
          query: {
            workspaceId: firstWorkspace.id,
            pageId,
          },
        });
        return;
      } else {
        const clearId = setTimeout(() => {
          dispose.dispose();
          router.replace({
            pathname: '/workspace/[workspaceId]/all',
            query: {
              workspaceId: firstWorkspace.id,
            },
          });
        }, 1000);
        const dispose = firstWorkspace.blockSuiteWorkspace.slots.pageAdded.once(
          pageId => {
            clearTimeout(clearId);
            router.replace({
              pathname: '/workspace/[workspaceId]/[pageId]',
              query: {
                workspaceId: firstWorkspace.id,
                pageId,
              },
            });
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
