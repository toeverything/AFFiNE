import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import {
  createTagFilter,
  useCollectionManager,
} from '@affine/component/page-list';
import { WorkspaceSubPath } from '@affine/env/workspace';
import { globalBlockSuiteSchema } from '@affine/workspace/manager';
import { SyncEngineStep } from '@affine/workspace/providers';
import type { EditorContainer } from '@blocksuite/editor';
import { assertExists } from '@blocksuite/global/utils';
import type { Page } from '@blocksuite/store';
import {
  contentLayoutAtom,
  currentPageIdAtom,
  currentWorkspaceIdAtom,
} from '@toeverything/infra/atom';
import { useAtomValue, useSetAtom } from 'jotai';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { type LoaderFunction, useParams } from 'react-router-dom';
import type { Map as YMap } from 'yjs';

import { getUIAdapter } from '../../adapters/workspace';
import { setPageModeAtom } from '../../atoms';
import { collectionsCRUDAtom } from '../../atoms/collections';
import { currentModeAtom } from '../../atoms/mode';
import { AffineErrorBoundary } from '../../components/affine/affine-error-boundary';
import { WorkspaceHeader } from '../../components/workspace-header';
import { useRegisterBlocksuiteEditorCommands } from '../../hooks/affine/use-register-blocksuite-editor-commands';
import { useCurrentSyncEngineStatus } from '../../hooks/current/use-current-sync-engine';
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
  const currentSyncEngineStatus = useCurrentSyncEngineStatus();
  const currentPageId = useAtomValue(currentPageIdAtom);
  const [page, setPage] = useState<Page | null>(null);
  const [pageLoaded, setPageLoaded] = useState<boolean>(false);

  // load page by current page id
  useEffect(() => {
    if (!currentPageId) {
      setPage(null);
      return;
    }

    const exists = currentWorkspace.blockSuiteWorkspace.getPage(currentPageId);

    if (exists) {
      setPage(exists);
      return;
    }

    const dispose = currentWorkspace.blockSuiteWorkspace.slots.pagesUpdated.on(
      () => {
        const exists =
          currentWorkspace.blockSuiteWorkspace.getPage(currentPageId);

        if (exists) {
          setPage(exists);
        }
      }
    );

    return dispose.dispose;
  }, [currentPageId, currentWorkspace]);

  const navigate = useNavigateHelper();

  // if sync engine has been synced and the page is null, wait 1s and jump to 404 page.
  useEffect(() => {
    if (currentSyncEngineStatus?.step === SyncEngineStep.Synced && !page) {
      const timeout = setTimeout(() => {
        navigate.jumpTo404();
      }, 1000);
      return () => {
        clearTimeout(timeout);
      };
    }
    return;
  }, [currentSyncEngineStatus, navigate, page]);

  // wait for page to be loaded
  useEffect(() => {
    if (page) {
      if (!page.isEmpty) {
        setPageLoaded(true);
      } else {
        setPageLoaded(false);
        // call waitForLoaded to trigger load
        page
          .load(() => {})
          .catch(() => {
            // do nothing
          });
        return page.slots.ready.on(() => {
          setPageLoaded(true);
        }).dispose;
      }
    } else {
      setPageLoaded(false);
    }
    return;
  }, [page]);

  if (!currentPageId || !page || !pageLoaded) {
    return <PageDetailSkeleton key="current-page-is-null" />;
  }

  if (page.meta.jumpOnce) {
    currentWorkspace.blockSuiteWorkspace.setPageMeta(page.id, {
      jumpOnce: false,
    });
  }

  return <DetailPageImpl />;
};

export const loader: LoaderFunction = async () => {
  return null;
};

export const Component = () => {
  performanceRenderLogger.info('DetailPage');

  const setContentLayout = useSetAtom(contentLayoutAtom);
  const setCurrentWorkspaceId = useSetAtom(currentWorkspaceIdAtom);
  const setCurrentPageId = useSetAtom(currentPageIdAtom);
  const params = useParams();

  useEffect(() => {
    setContentLayout('editor');
    if (params.workspaceId) {
      localStorage.setItem('last_workspace_id', params.workspaceId);
      setCurrentWorkspaceId(params.workspaceId);
    }
    if (params.pageId) {
      localStorage.setItem('last_page_id', params.pageId);
      setCurrentPageId(params.pageId);
    }
  }, [params, setContentLayout, setCurrentPageId, setCurrentWorkspaceId]);

  return (
    <AffineErrorBoundary>
      <DetailPage />
    </AffineErrorBoundary>
  );
};
