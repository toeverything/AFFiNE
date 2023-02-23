import { useRouter } from 'next/router';
import React from 'react';

import { PageLoading } from '../../../components/pure/loading';
import { useCurrentPageId } from '../../../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useLoadWorkspace } from '../../../hooks/use-load-workspace';
import { useSyncRouterWithCurrentWorkspace } from '../../../hooks/use-sync-router-with-current-workspace';
import { prefetchNecessaryData } from '../../../hooks/use-workspaces';
import { WorkspaceLayout } from '../../../layouts';
import { UIPlugins } from '../../../plugins';
import { NextPageWithLayout, RemWorkspaceFlavour } from '../../../shared';

const WorkspaceDetail: React.FC = () => {
  const [pageId] = useCurrentPageId();
  const [currentWorkspace] = useCurrentWorkspace();
  if (!currentWorkspace) {
    return <div>No current workspace</div>;
  }
  if (!pageId) {
    return <div>No current page</div>;
  }
  if (currentWorkspace.flavour === RemWorkspaceFlavour.AFFINE) {
    const PageDetail = UIPlugins[currentWorkspace.flavour].PageDetail;
    return (
      <PageDetail currentWorkspace={currentWorkspace} currentPageId={pageId} />
    );
  } else if (currentWorkspace.flavour === RemWorkspaceFlavour.LOCAL) {
    const PageDetail = UIPlugins[currentWorkspace.flavour].PageDetail;
    return (
      <PageDetail currentWorkspace={currentWorkspace} currentPageId={pageId} />
    );
  }
  return <div>impossible</div>;
};

prefetchNecessaryData();

const WorkspaceDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
  useLoadWorkspace(useCurrentWorkspace()[0]);
  useSyncRouterWithCurrentWorkspace(router);
  if (!router.isReady) {
    return <PageLoading />;
  } else if (
    typeof router.query.pageId !== 'string' ||
    typeof router.query.workspaceId !== 'string'
  ) {
    return <>not found router</>;
  }
  return <WorkspaceDetail />;
};

export default WorkspaceDetailPage;

WorkspaceDetailPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
