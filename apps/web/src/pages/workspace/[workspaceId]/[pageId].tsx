import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import {
  createTagFilter,
  useCollectionManager,
} from '@affine/component/page-list';
import { WorkspaceSubPath } from '@affine/env/workspace';
import { rootCurrentPageIdAtom } from '@affine/workspace/atom';
import type { EditorContainer } from '@blocksuite/editor';
import { assertExists } from '@blocksuite/global/utils';
import type { Page } from '@blocksuite/store';
import { useAtom, useAtomValue } from 'jotai';
import { useRouter } from 'next/router';
import type React from 'react';
import { useCallback, useEffect } from 'react';

import { getUIAdapter } from '../../../adapters/workspace';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useRouterHelper } from '../../../hooks/use-router-helper';
import { WorkspaceLayout } from '../../../layouts/workspace-layout';
import type { NextPageWithLayout } from '../../../shared';

const WorkspaceDetail: React.FC = () => {
  const router = useRouter();
  const { openPage, jumpToSubPath } = useRouterHelper(router);
  const currentPageId = useAtomValue(rootCurrentPageIdAtom);
  const [currentWorkspace] = useCurrentWorkspace();
  assertExists(currentWorkspace);
  assertExists(currentPageId);
  const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
  const collectionManager = useCollectionManager();
  const onLoad = useCallback(
    (page: Page, editor: EditorContainer) => {
      const dispose = editor.slots.pageLinkClicked.on(({ pageId }) => {
        return openPage(blockSuiteWorkspace.id, pageId);
      });
      const disposeTagClick = editor.slots.tagClicked.on(async ({ tagId }) => {
        await jumpToSubPath(currentWorkspace.id, WorkspaceSubPath.ALL);
        collectionManager.backToAll();
        collectionManager.setTemporaryFilter([createTagFilter(tagId)]);
      });
      return () => {
        dispose.dispose();
        disposeTagClick.dispose();
      };
    },
    [
      blockSuiteWorkspace.id,
      collectionManager,
      currentWorkspace.id,
      jumpToSubPath,
      openPage,
    ]
  );

  const { PageDetail, Header } = getUIAdapter(currentWorkspace.flavour);
  return (
    <>
      <Header
        currentWorkspaceId={currentWorkspace.id}
        currentEntry={{
          pageId: currentPageId,
        }}
      />
      <PageDetail
        currentWorkspaceId={currentWorkspace.id}
        currentPageId={currentPageId}
        onLoadEditor={onLoad}
      />
    </>
  );
};

const WorkspaceDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
  const [currentWorkspace] = useCurrentWorkspace();
  const [currentPageId, setCurrentPageId] = useAtom(rootCurrentPageIdAtom);
  const page = currentPageId
    ? currentWorkspace.blockSuiteWorkspace.getPage(currentPageId)
    : null;

  //#region check if page is valid
  useEffect(() => {
    // if the workspace changed, ignore the page check
    if (currentWorkspace.id !== router.query.workspaceId) {
      return;
    }
    if (
      typeof router.query.pageId === 'string' &&
      router.pathname === '/workspace/[workspaceId]/[pageId]' &&
      currentPageId
    ) {
      if (currentPageId !== router.query.pageId) {
        setCurrentPageId(router.query.pageId);
      } else {
        const page =
          currentWorkspace.blockSuiteWorkspace.getPage(currentPageId);
        if (!page) {
          router.push('/404').catch(console.error);
        }
      }
    }
  }, [
    currentPageId,
    currentWorkspace.blockSuiteWorkspace,
    currentWorkspace.id,
    router,
    setCurrentPageId,
  ]);
  //#endregion

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
