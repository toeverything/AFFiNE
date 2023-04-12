import { WorkspaceFlavour } from '@affine/workspace/type';
import { assertExists } from '@blocksuite/store';
import { useRouter } from 'next/router';
import type React from 'react';
import { useCallback, useEffect } from 'react';

import { Unreachable } from '../../../components/affine/affine-error-eoundary';
import { PageLoading } from '../../../components/pure/loading';
import { useReferenceLink } from '../../../hooks/affine/use-reference-link';
import { useCurrentPageId } from '../../../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { usePageMeta, usePageMetaHelper } from '../../../hooks/use-page-meta';
import { usePinboardHandler } from '../../../hooks/use-pinboard-handler';
import { useSyncRecentViewsWithRouter } from '../../../hooks/use-recent-views';
import { useRouterHelper } from '../../../hooks/use-router-helper';
import { useSyncRouterWithCurrentWorkspaceAndPage } from '../../../hooks/use-sync-router-with-current-workspace-and-page';
import { WorkspaceLayout } from '../../../layouts';
import { WorkspacePlugins } from '../../../plugins';
import type { BlockSuiteWorkspace, NextPageWithLayout } from '../../../shared';

function enableFullFlags(blockSuiteWorkspace: BlockSuiteWorkspace) {
  blockSuiteWorkspace.awarenessStore.setFlag('enable_set_remote_flag', false);
  blockSuiteWorkspace.awarenessStore.setFlag('enable_database', true);
  blockSuiteWorkspace.awarenessStore.setFlag('enable_slash_menu', true);
  blockSuiteWorkspace.awarenessStore.setFlag('enable_edgeless_toolbar', true);
  blockSuiteWorkspace.awarenessStore.setFlag('enable_block_hub', true);
  blockSuiteWorkspace.awarenessStore.setFlag('enable_drag_handle', true);
  blockSuiteWorkspace.awarenessStore.setFlag('enable_surface', true);
  blockSuiteWorkspace.awarenessStore.setFlag('enable_linked_page', true);
}

const WorkspaceDetail: React.FC = () => {
  const router = useRouter();
  const { openPage } = useRouterHelper(router);
  const [currentPageId] = useCurrentPageId();
  const [currentWorkspace] = useCurrentWorkspace();
  const blockSuiteWorkspace = currentWorkspace?.blockSuiteWorkspace ?? null;
  const { setPageMeta, getPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const { deletePin } = usePinboardHandler({
    blockSuiteWorkspace,
    metas: usePageMeta(currentWorkspace?.blockSuiteWorkspace ?? null ?? null),
  });

  useSyncRecentViewsWithRouter(router);

  useReferenceLink({
    pageLinkClicked: useCallback(
      ({ pageId }: { pageId: string }) => {
        assertExists(currentWorkspace);
        return openPage(currentWorkspace.id, pageId);
      },
      [currentWorkspace, openPage]
    ),
    subpageUnlinked: useCallback(
      ({ pageId }: { pageId: string }) => {
        deletePin(pageId);
      },
      [deletePin]
    ),
    subpageLinked: useCallback(
      ({ pageId }: { pageId: string }) => {
        const meta = currentPageId && getPageMeta(currentPageId);
        if (!meta || meta.subpageIds?.includes(pageId)) {
          return;
        }
        setPageMeta(currentPageId, {
          subpageIds: [...(meta.subpageIds ?? []), pageId],
        });
      },
      [currentPageId, getPageMeta, setPageMeta]
    ),
  });

  useEffect(() => {
    if (currentWorkspace) {
      enableFullFlags(currentWorkspace.blockSuiteWorkspace);
    }
  }, [currentWorkspace]);
  if (currentWorkspace === null) {
    return <PageLoading />;
  }
  if (!currentPageId) {
    return <PageLoading />;
  }
  if (currentWorkspace.flavour === WorkspaceFlavour.AFFINE) {
    const PageDetail = WorkspacePlugins[currentWorkspace.flavour].UI.PageDetail;
    return (
      <PageDetail
        currentWorkspace={currentWorkspace}
        currentPageId={currentPageId}
      />
    );
  } else if (currentWorkspace.flavour === WorkspaceFlavour.LOCAL) {
    const PageDetail = WorkspacePlugins[currentWorkspace.flavour].UI.PageDetail;
    return (
      <PageDetail
        currentWorkspace={currentWorkspace}
        currentPageId={currentPageId}
      />
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
