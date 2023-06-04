import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import { rootCurrentPageIdAtom } from '@affine/workspace/atom';
import type { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { useBlockSuiteWorkspacePage } from '@toeverything/hooks/use-block-suite-workspace-page';
import { useAtomValue } from 'jotai';
import { useRouter } from 'next/router';
import type React from 'react';
import { useCallback } from 'react';

import { getUIAdapter } from '../../../adapters/workspace';
import { rootCurrentWorkspaceAtom } from '../../../atoms/root';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useSyncRecentViewsWithRouter } from '../../../hooks/use-recent-views';
import { useRouterHelper } from '../../../hooks/use-router-helper';
import { WorkspaceLayout } from '../../../layouts/workspace-layout';
import type { NextPageWithLayout } from '../../../shared';

const WorkspaceDetail: React.FC = () => {
  const router = useRouter();
  const { openPage } = useRouterHelper(router);
  const currentPageId = useAtomValue(rootCurrentPageIdAtom);
  const [currentWorkspace] = useCurrentWorkspace();
  assertExists(currentWorkspace);
  assertExists(currentPageId);
  const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
  useSyncRecentViewsWithRouter(router, blockSuiteWorkspace);

  const onLoad = useCallback(
    (page: Page, editor: EditorContainer) => {
      const dispose = editor.slots.pageLinkClicked.on(({ pageId }) => {
        return openPage(blockSuiteWorkspace.id, pageId);
      });
      return () => {
        dispose.dispose();
      };
    },
    [blockSuiteWorkspace.id, openPage]
  );

  const { PageDetail, Header } = getUIAdapter(currentWorkspace.flavour);
  return (
    <>
      <Header
        currentWorkspace={currentWorkspace}
        currentEntry={{
          pageId: currentPageId,
        }}
      />
      <PageDetail
        currentWorkspace={currentWorkspace}
        currentPageId={currentPageId}
        onLoadEditor={onLoad}
      />
    </>
  );
};

const WorkspaceDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
  const currentWorkspace = useAtomValue(rootCurrentWorkspaceAtom);
  const currentPageId = useAtomValue(rootCurrentPageIdAtom);
  const page = useBlockSuiteWorkspacePage(
    currentWorkspace.blockSuiteWorkspace,
    currentPageId
  );
  if (!router.isReady) {
    return <PageDetailSkeleton key="router-not-ready" />;
  } else if (!currentPageId || !page) {
    return <PageDetailSkeleton key="current-page-is-null" />;
  }
  return <WorkspaceDetail />;
};

export default WorkspaceDetailPage;

WorkspaceDetailPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
