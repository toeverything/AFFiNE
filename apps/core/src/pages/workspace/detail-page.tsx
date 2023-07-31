import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import {
  createTagFilter,
  useCollectionManager,
} from '@affine/component/page-list';
import { WorkspaceSubPath } from '@affine/env/workspace';
import type { EditorContainer } from '@blocksuite/editor';
import { assertExists } from '@blocksuite/global/utils';
import type { Page } from '@blocksuite/store';
import { currentPageIdAtom, rootStore } from '@toeverything/plugin-infra/atom';
import { useAtomValue } from 'jotai';
import { useAtom } from 'jotai/react';
import { type ReactElement, useCallback, useEffect } from 'react';
import type { LoaderFunction } from 'react-router-dom';
import { useLocation, useParams } from 'react-router-dom';

import { getUIAdapter } from '../../adapters/workspace';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../../hooks/use-navigate-helper';

const DetailPageImpl = (): ReactElement => {
  const { openPage, jumpToSubPath } = useNavigateHelper();
  const currentPageId = useAtomValue(currentPageIdAtom);
  const [currentWorkspace] = useCurrentWorkspace();
  assertExists(currentWorkspace);
  assertExists(currentPageId);
  const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
  const collectionManager = useCollectionManager(currentWorkspace.id);
  const onLoad = useCallback(
    (_: Page, editor: EditorContainer) => {
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

export const DetailPage = (): ReactElement => {
  const { workspaceId, pageId } = useParams();
  const location = useLocation();
  const { jumpTo404 } = useNavigateHelper();
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
          jumpTo404();
        } else {
          // fixme: cleanup jumpOnce in the right time
          if (page.meta.jumpOnce) {
            currentWorkspace.blockSuiteWorkspace.setPageMeta(currentPageId, {
              jumpOnce: false,
            });
          }
        }
      }
    }
  }, [
    currentPageId,
    currentWorkspace.blockSuiteWorkspace,
    currentWorkspace.id,
    jumpTo404,
    location.pathname,
    pageId,
    setCurrentPageId,
    workspaceId,
  ]);
  //#endregion

  if (!currentPageId || !page) {
    return <PageDetailSkeleton key="current-page-is-null" />;
  }
  return <DetailPageImpl />;
};

export const loader: LoaderFunction = args => {
  if (args.params.pageId) {
    localStorage.setItem('last_page_id', args.params.pageId);
    rootStore.set(currentPageIdAtom, args.params.pageId);
  }
  return null;
};

export const Component = () => {
  return <DetailPage />;
};
