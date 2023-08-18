import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import {
  createTagFilter,
  useCollectionManager,
} from '@affine/component/page-list';
import { WorkspaceSubPath } from '@affine/env/workspace';
import type { EditorContainer } from '@blocksuite/editor';
import { assertExists } from '@blocksuite/global/utils';
import type { Page } from '@blocksuite/store';
import {
  contentLayoutAtom,
  currentPageIdAtom,
  currentWorkspaceAtom,
  currentWorkspaceIdAtom,
  rootStore,
} from '@toeverything/infra/atom';
import { useAtomValue } from 'jotai';
import { type ReactElement, useCallback } from 'react';
import type { LoaderFunction } from 'react-router-dom';
import { redirect } from 'react-router-dom';

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
        jumpToSubPath(currentWorkspace.id, WorkspaceSubPath.ALL);
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
  const [currentWorkspace] = useCurrentWorkspace();
  const currentPageId = useAtomValue(currentPageIdAtom);
  const page = currentPageId
    ? currentWorkspace.blockSuiteWorkspace.getPage(currentPageId)
    : null;

  if (!currentPageId || !page) {
    return <PageDetailSkeleton key="current-page-is-null" />;
  }
  return <DetailPageImpl />;
};

export const loader: LoaderFunction = async args => {
  rootStore.set(contentLayoutAtom, 'editor');
  if (args.params.workspaceId) {
    localStorage.setItem('last_workspace_id', args.params.workspaceId);
    rootStore.set(currentWorkspaceIdAtom, args.params.workspaceId);
  }
  if (args.params.pageId) {
    const pageId = args.params.pageId;
    localStorage.setItem('last_page_id', pageId);
    const currentWorkspace = await rootStore.get(currentWorkspaceAtom);
    const page = currentWorkspace.getPage(pageId);
    if (!page) {
      return redirect('/404');
    }
    if (page.meta.jumpOnce) {
      currentWorkspace.setPageMeta(page.id, {
        jumpOnce: false,
      });
    }
    rootStore.set(currentPageIdAtom, pageId);
  } else {
    return redirect('/404');
  }
  return null;
};

export const Component = () => {
  return <DetailPage />;
};
