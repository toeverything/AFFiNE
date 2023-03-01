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
import {
  BlockSuiteWorkspace,
  NextPageWithLayout,
  RemWorkspaceFlavour,
} from '../../../shared';

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
