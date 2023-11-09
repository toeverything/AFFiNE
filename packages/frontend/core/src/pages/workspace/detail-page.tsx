import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import {
  createTagFilter,
  useCollectionManager,
} from '@affine/component/page-list';
import { WorkspaceSubPath } from '@affine/env/workspace';
import { globalBlockSuiteSchema } from '@affine/workspace/manager';
import type { EditorContainer } from '@blocksuite/editor';
import { assertExists } from '@blocksuite/global/utils';
import type { Page } from '@blocksuite/store';
import {
  contentLayoutAtom,
  currentPageIdAtom,
  currentWorkspaceAtom,
  currentWorkspaceIdAtom,
  getCurrentStore,
} from '@toeverything/infra/atom';
import { useAtomValue, useSetAtom } from 'jotai';
import { type ReactElement, useCallback } from 'react';
import type { LoaderFunction } from 'react-router-dom';
import { redirect } from 'react-router-dom';
import type { Map as YMap } from 'yjs';

import { getUIAdapter } from '../../adapters/workspace';
import { setPageModeAtom } from '../../atoms';
import { collectionsCRUDAtom } from '../../atoms/collections';
import { currentModeAtom } from '../../atoms/mode';
import { WorkspaceHeader } from '../../components/workspace-header';
import { useRegisterBlocksuiteEditorCommands } from '../../hooks/affine/use-register-blocksuite-editor-commands';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../../hooks/use-navigate-helper';
import { performanceRenderLogger } from '../../shared';

const DetailPageImpl = (): ReactElement => {
  const { openPage, jumpToSubPath } = useNavigateHelper();
  const currentPageId = useAtomValue(currentPageIdAtom);
  const [currentWorkspace] = useCurrentWorkspace();
  assertExists(currentWorkspace);
  assertExists(currentPageId);
  const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
  const { setTemporaryFilter } = useCollectionManager(collectionsCRUDAtom);
  const mode = useAtomValue(currentModeAtom);
  const setPageMode = useSetAtom(setPageModeAtom);
  useRegisterBlocksuiteEditorCommands(blockSuiteWorkspace, currentPageId, mode);
  const onLoad = useCallback(
    (page: Page, editor: EditorContainer) => {
      try {
        const surfaceBlock = page.getBlockByFlavour('affine:surface')[0];
        // hotfix for old page
        if (
          surfaceBlock &&
          (surfaceBlock.yBlock.get('prop:elements') as YMap<any>).get(
            'type'
          ) !== '$blocksuite:internal:native$'
        ) {
          globalBlockSuiteSchema.upgradePage(
            0,
            {
              'affine:surface': 3,
            },
            page.spaceDoc
          );
        }
      } catch {}
      setPageMode(currentPageId, mode);
      const dispose = editor.slots.pageLinkClicked.on(({ pageId }) => {
        return openPage(blockSuiteWorkspace.id, pageId);
      });
      const disposeTagClick = editor.slots.tagClicked.on(async ({ tagId }) => {
        jumpToSubPath(currentWorkspace.id, WorkspaceSubPath.ALL);
        setTemporaryFilter([createTagFilter(tagId)]);
      });
      return () => {
        dispose.dispose();
        disposeTagClick.dispose();
      };
    },
    [
      blockSuiteWorkspace.id,
      currentPageId,
      currentWorkspace.id,
      jumpToSubPath,
      mode,
      openPage,
      setPageMode,
      setTemporaryFilter,
    ]
  );

  const { PageDetail } = getUIAdapter(currentWorkspace.flavour);
  return (
    <>
      <WorkspaceHeader
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
  const rootStore = getCurrentStore();
  rootStore.set(contentLayoutAtom, 'editor');
  if (args.params.workspaceId) {
    localStorage.setItem('last_workspace_id', args.params.workspaceId);
    rootStore.set(currentWorkspaceIdAtom, args.params.workspaceId);
  }
  const currentWorkspace = await rootStore.get(currentWorkspaceAtom);
  if (args.params.pageId) {
    const pageId = args.params.pageId;
    localStorage.setItem('last_page_id', pageId);
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
  performanceRenderLogger.info('DetailPage');

  return <DetailPage />;
};
