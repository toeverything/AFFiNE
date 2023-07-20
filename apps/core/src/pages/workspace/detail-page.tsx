import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import {
  createTagFilter,
  useCollectionManager,
} from '@affine/component/page-list';
import { WorkspaceSubPath } from '@affine/env/workspace';
import type { EditorContainer } from '@blocksuite/editor';
import { assertExists } from '@blocksuite/global/utils';
import type { Page } from '@blocksuite/store';
import { currentPageIdAtom } from '@toeverything/plugin-infra/manager';
import { useAtomValue } from 'jotai';
import { useAtom } from 'jotai/react';
import { type ReactElement, useCallback, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { getUIAdapter } from '../../adapters/workspace';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../../hooks/use-navigate-helper';
import { WorkspaceLayout } from '../../layouts/workspace-layout';

const WorkspaceDetailPageImpl = (): ReactElement => {
  const { openPage, jumpToSubPath } = useNavigateHelper();
  const currentPageId = useAtomValue(currentPageIdAtom);
  const [currentWorkspace] = useCurrentWorkspace();
  assertExists(currentWorkspace);
  assertExists(currentPageId);
  const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
  const collectionManager = useCollectionManager(currentWorkspace.id);
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

const WorkspaceDetailPage = (): ReactElement => {
  const { workspaceId, pageId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [currentWorkspace] = useCurrentWorkspace();
  const [currentPageId, setCurrentPageId] = useAtom(currentPageIdAtom);
  const page = currentPageId
    ? currentWorkspace.blockSuiteWorkspace.getPage(currentPageId)
    : null;

  //#region check if page is valid
  useEffect(() => {
    // if the workspace changed, ignore the page check
    if (currentWorkspace.id !== workspaceId) {
      return;
    }
    if (typeof pageId === 'string' && currentPageId) {
      if (currentPageId !== pageId) {
        setCurrentPageId(pageId);
      } else {
        const page =
          currentWorkspace.blockSuiteWorkspace.getPage(currentPageId);
        if (!page) {
          navigate('/404');
        }
      }
    }
  }, [
    currentPageId,
    currentWorkspace.blockSuiteWorkspace,
    currentWorkspace.id,
    location.pathname,
    navigate,
    pageId,
    setCurrentPageId,
    workspaceId,
  ]);
  //#endregion

  if (!currentPageId || !page) {
    return <PageDetailSkeleton key="current-page-is-null" />;
  }
  return <WorkspaceDetailPageImpl />;
};

export const Component = () => {
  return (
    <WorkspaceLayout>
      <WorkspaceDetailPage />
    </WorkspaceLayout>
  );
};
