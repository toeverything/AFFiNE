import { useRouter } from 'next/router';
import React from 'react';

import { Unreachable } from '../../../components/affine/affine-error-eoundary';
import { PageLoading } from '../../../components/pure/loading';
import { useCurrentPageId } from '../../../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useLoadWorkspace } from '../../../hooks/use-load-workspace';
import { useSyncRouterWithCurrentWorkspaceAndPage } from '../../../hooks/use-sync-router-with-current-workspace-and-page';
import { prefetchNecessaryData } from '../../../hooks/use-workspaces';
import { WorkspaceLayout } from '../../../layouts';
import { UIPlugins } from '../../../plugins';
import { NextPageWithLayout, RemWorkspaceFlavour } from '../../../shared';

const WorkspaceDetail: React.FC = () => {
  const [pageId] = useCurrentPageId();
  const [currentWorkspace] = useCurrentWorkspace();
  if (!currentWorkspace) {
    throw new Unreachable();
  }
  if (!pageId) {
    return <PageLoading />;
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
  throw new Unreachable();
};

prefetchNecessaryData();

const WorkspaceDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
  useLoadWorkspace(useCurrentWorkspace()[0]);
  useSyncRouterWithCurrentWorkspaceAndPage(router);
  if (!router.isReady) {
    return <PageLoading />;
  } else if (
    typeof router.query.pageId !== 'string' ||
    typeof router.query.workspaceId !== 'string'
  ) {
    throw new Error('Invalid router query');
  }
  return <WorkspaceDetail />;
};

export default WorkspaceDetailPage;

WorkspaceDetailPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
