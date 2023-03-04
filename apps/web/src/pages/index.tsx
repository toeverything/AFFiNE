import { DEFAULT_WORKSPACE_NAME } from '@affine/env';
import { nanoid } from '@blocksuite/store';
import { useAtom } from 'jotai';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import React, { Suspense, useEffect } from 'react';

import { currentWorkspaceIdAtom, jotaiWorkspacesAtom } from '../atoms';
import { PageLoading } from '../components/pure/loading';
import { useWorkspaces } from '../hooks/use-workspaces';
import { LocalPlugin } from '../plugins/local';
import { RemWorkspaceFlavour } from '../shared';
import { createEmptyBlockSuiteWorkspace } from '../utils';

const IndexPageInner = () => {
  const router = useRouter();
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

const IndexPage: NextPage = () => {
  const [jotaiWorkspaces, set] = useAtom(jotaiWorkspacesAtom);
  useEffect(() => {
    const controller = new AbortController();

    /**
     * Create a first workspace, only just once for a browser
     */
    async function createFirst() {
      const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
        nanoid(),
        (_: string) => undefined
      );
      blockSuiteWorkspace.meta.setName(DEFAULT_WORKSPACE_NAME);
      const id = await LocalPlugin.CRUD.create(blockSuiteWorkspace);
      blockSuiteWorkspace.slots.pageAdded.once(() => {
        set(workspaces => [
          ...workspaces,
          {
            id,
            flavour: RemWorkspaceFlavour.LOCAL,
          },
        ]);
      });
      blockSuiteWorkspace.createPage(nanoid());
    }
    if (
      jotaiWorkspaces.length === 0 &&
      sessionStorage.getItem('first') === null
    ) {
      sessionStorage.setItem('first', 'true');
      createFirst();
    }
    return () => {
      controller.abort();
    };
  }, [jotaiWorkspaces.length, set]);
  return (
    <Suspense fallback={<PageLoading />}>
      <IndexPageInner />
    </Suspense>
  );
};

export default IndexPage;
