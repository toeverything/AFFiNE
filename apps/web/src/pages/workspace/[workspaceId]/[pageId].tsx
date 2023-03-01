import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';

import { Unreachable } from '../../../components/affine/affine-error-eoundary';
import { PageLoading } from '../../../components/pure/loading';
import { useCurrentPageId } from '../../../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useLoadWorkspace } from '../../../hooks/use-load-workspace';
import { useSyncRouterWithCurrentWorkspaceAndPage } from '../../../hooks/use-sync-router-with-current-workspace-and-page';
import { WorkspaceLayout } from '../../../layouts';
import { WorkspacePlugins } from '../../../plugins';
import { NextPageWithLayout, RemWorkspaceFlavour } from '../../../shared';

const WorkspaceDetail: React.FC = () => {
  const [pageId] = useCurrentPageId();
  const [currentWorkspace] = useCurrentWorkspace();
  const [, rerender] = useState(false);
  // fixme(himself65): this is a hack
  useEffect(() => {
    const dispose = currentWorkspace?.blockSuiteWorkspace.signals.pageAdded.on(
      id => {
        if (pageId === id) {
          rerender(prev => !prev);
        }
      }
    );
    return () => {
      dispose?.dispose();
    };
  }, [currentWorkspace?.blockSuiteWorkspace.signals.pageAdded, pageId]);
  if (currentWorkspace === null) {
    return <PageLoading />;
  }
  if (!pageId) {
    return <PageLoading />;
  }
  if (!currentWorkspace.blockSuiteWorkspace.getPage(pageId)) {
    return <PageLoading />;
  }
  if (currentWorkspace.flavour === RemWorkspaceFlavour.AFFINE) {
    const PageDetail = WorkspacePlugins[currentWorkspace.flavour].PageDetail;
    return (
      <PageDetail currentWorkspace={currentWorkspace} currentPageId={pageId} />
    );
  } else if (currentWorkspace.flavour === RemWorkspaceFlavour.LOCAL) {
    const PageDetail = WorkspacePlugins[currentWorkspace.flavour].PageDetail;
    return (
      <PageDetail currentWorkspace={currentWorkspace} currentPageId={pageId} />
    );
  }
  throw new Unreachable();
};

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
