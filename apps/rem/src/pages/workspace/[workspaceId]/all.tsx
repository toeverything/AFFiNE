import { assertExists } from '@blocksuite/store';
import { useRouter } from 'next/router';
import React, { useCallback } from 'react';

import { QueryParamError } from '../../../components/blocksuite/block-suite-error-eoundary';
import { PageLoading } from '../../../components/pure/loading';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useLoadWorkspace } from '../../../hooks/use-load-workspace';
import { useSyncRouterWithCurrentWorkspace } from '../../../hooks/use-sync-router-with-current-workspace';
import { prefetchNecessaryData } from '../../../hooks/use-workspaces';
import { WorkspaceLayout } from '../../../layouts';
import { UIPlugins } from '../../../plugins';
import { NextPageWithLayout, RemWorkspaceFlavour } from '../../../shared';

prefetchNecessaryData();

const AllPage: NextPageWithLayout = () => {
  const router = useRouter();
  const [currentWorkspace] = useCurrentWorkspace();
  useLoadWorkspace(currentWorkspace);
  useSyncRouterWithCurrentWorkspace(router);
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
  }
  if (typeof router.query.workspaceId !== 'string') {
    throw new QueryParamError('workspaceId', router.query.workspaceId);
  }
  if (!currentWorkspace) {
    return <PageLoading />;
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
