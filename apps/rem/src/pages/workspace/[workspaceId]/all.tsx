import { assertExists } from '@blocksuite/store';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect } from 'react';

import { PageLoading } from '../../../components/pure/loading';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useLoadWorkspace } from '../../../hooks/use-load-workspace';
import {
  prefetchNecessaryData,
  useWorkspaces,
} from '../../../hooks/use-workspaces';
import { WorkspaceLayout } from '../../../layouts';
import { UIPlugins } from '../../../plugins';
import { NextPageWithLayout, RemWorkspaceFlavour } from '../../../shared';

prefetchNecessaryData();

const AllPage: NextPageWithLayout = () => {
  const router = useRouter();
  const [currentWorkspace, setCurrentWorkspaceId] = useCurrentWorkspace();
  useLoadWorkspace(currentWorkspace);
  const workspaces = useWorkspaces();
  useEffect(() => {
    const listener: Parameters<typeof router.events.on>[1] = (url: string) => {
      if (url.startsWith('/')) {
        const path = url.split('/');
        if (path.length === 4 && path[1] === 'workspace') {
          setCurrentWorkspaceId(path[2]);
        }
      }
    };

    router.events.on('routeChangeStart', listener);
    return () => {
      router.events.off('routeChangeStart', listener);
    };
  }, [currentWorkspace, router, setCurrentWorkspaceId]);
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const workspaceId = router.query.workspaceId;
    if (typeof workspaceId !== 'string') {
      return;
    }
    if (!currentWorkspace) {
      const targetWorkspace = workspaces.find(
        workspace => workspace.id === workspaceId
      );
      if (targetWorkspace) {
        setCurrentWorkspaceId(targetWorkspace.id);
      } else {
        const targetWorkspace = workspaces.at(0);
        if (targetWorkspace) {
          setCurrentWorkspaceId(targetWorkspace.id);
          router.push({
            pathname: '/workspace/[workspaceId]/all',
            query: {
              workspaceId: targetWorkspace.id,
            },
          });
        }
      }
    }
  }, [currentWorkspace, router, setCurrentWorkspaceId, workspaces]);
  const openPage = useCallback(
    (id: string) => {
      assertExists(currentWorkspace);
      router.push({
        pathname: '/workspace/[workspaceId]/[pageId]',
        query: {
          workspaceId: currentWorkspace.id,
          pageId: id,
        },
      });
    },
    [currentWorkspace, router]
  );
  if (!router.isReady) {
    return <PageLoading />;
  } else if (typeof router.query.workspaceId !== 'string') {
    return <>not found router</>;
  }
  if (!currentWorkspace) {
    return <>loading workspace</>;
  }
  if (currentWorkspace.flavour === RemWorkspaceFlavour.AFFINE) {
    const PageList = UIPlugins[currentWorkspace.flavour].PageList;
    if (currentWorkspace.firstBinarySynced) {
      return (
        <PageList
          onClickPage={openPage}
          blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
        />
      );
    } else {
      return <div>loading</div>;
    }
  } else if (currentWorkspace.flavour === RemWorkspaceFlavour.LOCAL) {
    const PageList = UIPlugins[currentWorkspace.flavour].PageList;
    return (
      <PageList
        onClickPage={openPage}
        blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
      />
    );
  }
  return <div>impossible</div>;
};

export default AllPage;

AllPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
