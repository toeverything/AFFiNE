import { WorkspaceFlavour } from '@affine/workspace/type';
import { useRouter } from 'next/router';
import type React from 'react';
import { useEffect } from 'react';

import { Unreachable } from '../../../components/affine/affine-error-eoundary';
import { PageLoading } from '../../../components/pure/loading';
import { useCurrentPageId } from '../../../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useSyncRecentViewsWithRouter } from '../../../hooks/use-recent-views';
import { useSyncRouterWithCurrentWorkspaceAndPage } from '../../../hooks/use-sync-router-with-current-workspace-and-page';
import { WorkspaceLayout } from '../../../layouts';
import { WorkspacePlugins } from '../../../plugins';
import type { BlockSuiteWorkspace, NextPageWithLayout } from '../../../shared';

function enableFullFlags(blockSuiteWorkspace: BlockSuiteWorkspace) {
  blockSuiteWorkspace.awarenessStore.setFlag('enable_set_remote_flag', false);
  blockSuiteWorkspace.awarenessStore.setFlag('enable_database', false);
  blockSuiteWorkspace.awarenessStore.setFlag('enable_slash_menu', true);
  blockSuiteWorkspace.awarenessStore.setFlag('enable_edgeless_toolbar', true);
  blockSuiteWorkspace.awarenessStore.setFlag('enable_block_hub', true);
  blockSuiteWorkspace.awarenessStore.setFlag('enable_drag_handle', true);
  blockSuiteWorkspace.awarenessStore.setFlag('enable_surface', true);
}

const WorkspaceDetail: React.FC = () => {
  const [pageId] = useCurrentPageId();
  const [currentWorkspace] = useCurrentWorkspace();
  useSyncRecentViewsWithRouter(useRouter());
  useEffect(() => {
    if (currentWorkspace) {
      enableFullFlags(currentWorkspace.blockSuiteWorkspace);
    }
  }, [currentWorkspace]);
  if (currentWorkspace === null) {
    return <PageLoading />;
  }
  if (!pageId) {
    return <PageLoading />;
  }
  if (currentWorkspace.flavour === WorkspaceFlavour.AFFINE) {
    const PageDetail = WorkspacePlugins[currentWorkspace.flavour].UI.PageDetail;
    return (
      <PageDetail currentWorkspace={currentWorkspace} currentPageId={pageId} />
    );
  } else if (currentWorkspace.flavour === WorkspaceFlavour.LOCAL) {
    const PageDetail = WorkspacePlugins[currentWorkspace.flavour].UI.PageDetail;
    return (
      <PageDetail currentWorkspace={currentWorkspace} currentPageId={pageId} />
    );
  }
  throw new Unreachable();
};

const WorkspaceDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
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
