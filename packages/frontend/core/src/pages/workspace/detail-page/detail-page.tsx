import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import { ResizePanel } from '@affine/component/resize-panel';
import { useBlockSuitePageMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { useWorkspaceStatus } from '@affine/core/hooks/use-workspace-status';
import { waitForCurrentWorkspaceAtom } from '@affine/core/modules/workspace';
import { WorkspaceSubPath } from '@affine/core/shared';
import { globalBlockSuiteSchema, SyncEngineStep } from '@affine/workspace';
import type { AffineEditorContainer } from '@blocksuite/presets';
import type { Page, Workspace } from '@blocksuite/store';
import { appSettingAtom } from '@toeverything/infra/atom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  memo,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useParams } from 'react-router-dom';
import type { Map as YMap } from 'yjs';

import { setPageModeAtom } from '../../../atoms';
import { collectionsCRUDAtom } from '../../../atoms/collections';
import { currentModeAtom, currentPageIdAtom } from '../../../atoms/mode';
import { AffineErrorBoundary } from '../../../components/affine/affine-error-boundary';
import { HubIsland } from '../../../components/affine/hub-island';
import { GlobalPageHistoryModal } from '../../../components/affine/page-history-modal';
import { ImagePreviewModal } from '../../../components/image-preview';
import { PageDetailEditor } from '../../../components/page-detail-editor';
import {
  createTagFilter,
  useCollectionManager,
} from '../../../components/page-list';
import { TrashPageFooter } from '../../../components/pure/trash-page-footer';
import { TopTip } from '../../../components/top-tip';
import { useRegisterBlocksuiteEditorCommands } from '../../../hooks/affine/use-register-blocksuite-editor-commands';
import { usePageDocumentTitle } from '../../../hooks/use-global-state';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import { performanceRenderLogger } from '../../../shared';
import { PageNotFound } from '../../404';
import * as styles from './detail-page.css';
import { DetailPageHeader, RightSidebarHeader } from './detail-page-header';
import {
  EditorSidebar,
  editorSidebarOpenAtom,
  editorSidebarResizingAtom,
  editorSidebarWidthAtom,
} from './editor-sidebar';

interface DetailPageLayoutProps {
  main: ReactNode;
  header: ReactNode;
  footer: ReactNode;
  sidebar: ReactNode;
}

const MIN_SIDEBAR_WIDTH = 320;
const MAX_SIDEBAR_WIDTH = 800;

// todo: consider move to a shared place if we also want to reuse the layout for other routes
const DetailPageLayout = ({
  main,
  header,
  footer,
  sidebar,
}: DetailPageLayoutProps): ReactElement => {
  const [width, setWidth] = useAtom(editorSidebarWidthAtom);
  const { clientBorder } = useAtomValue(appSettingAtom);
  const [resizing, setResizing] = useAtom(editorSidebarResizingAtom);
  const [open, setOpen] = useAtom(editorSidebarOpenAtom);

  return (
    <div className={styles.root} data-client-border={clientBorder && open}>
      <div className={styles.mainContainer}>
        {header}
        {main}
        {footer}
      </div>
      {sidebar ? (
        <ResizePanel
          enableAnimation={false}
          resizeHandlePos="left"
          resizeHandleOffset={clientBorder ? 4 : 0}
          width={width}
          className={styles.sidebarContainer}
          onResizing={setResizing}
          resizing={resizing}
          open={open}
          onOpen={setOpen}
          onWidthChange={setWidth}
          minWidth={MIN_SIDEBAR_WIDTH}
          maxWidth={MAX_SIDEBAR_WIDTH}
        >
          {sidebar}
        </ResizePanel>
      ) : null}
    </div>
  );
};

const DetailPageImpl = memo(function DetailPageImpl({ page }: { page: Page }) {
  const currentPageId = page.id;
  const { openPage, jumpToSubPath } = useNavigateHelper();
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);
  const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;

  const pageMeta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === page.id
  );

  const isInTrash = pageMeta?.trash;

  const { setTemporaryFilter } = useCollectionManager(collectionsCRUDAtom);
  const mode = useAtomValue(currentModeAtom);
  const setPageMode = useSetAtom(setPageModeAtom);
  useRegisterBlocksuiteEditorCommands(currentPageId, mode);
  usePageDocumentTitle(pageMeta);

  const onLoad = useCallback(
    (page: Page, editor: AffineEditorContainer) => {
      try {
        // todo(joooye34): improve the following migration code
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
      // fixme: it seems pageLinkClicked is not triggered sometimes?
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

  return (
    <>
      <DetailPageLayout
        header={
          <>
            <DetailPageHeader
              page={page}
              workspace={currentWorkspace}
              showSidebarSwitch={!isInTrash}
            />
            <TopTip pageId={currentPageId} workspace={currentWorkspace} />
          </>
        }
        main={
          // Add a key to force rerender when page changed, to avoid error boundary persisting.
          <AffineErrorBoundary key={currentPageId}>
            <div className={styles.editorContainer}>
              <PageDetailEditor
                pageId={currentPageId}
                onLoad={onLoad}
                workspace={blockSuiteWorkspace}
              />
              <HubIsland />
            </div>
          </AffineErrorBoundary>
        }
        footer={isInTrash ? <TrashPageFooter pageId={page.id} /> : null}
        sidebar={
          !isInTrash ? (
            <div className={styles.sidebarContainerInner}>
              <RightSidebarHeader workspace={blockSuiteWorkspace} page={page} />
              <EditorSidebar workspace={blockSuiteWorkspace} page={page} />
            </div>
          ) : null
        }
      />
      <ImagePreviewModal
        pageId={currentPageId}
        workspace={blockSuiteWorkspace}
      />
      <GlobalPageHistoryModal />
    </>
  );
});

const useForceUpdate = () => {
  const [, setCount] = useState(0);
  return useCallback(() => setCount(count => count + 1), []);
};
const useSafePage = (workspace: Workspace, pageId: string) => {
  const forceUpdate = useForceUpdate();
  useEffect(() => {
    const disposable = workspace.slots.pagesUpdated.on(() => {
      forceUpdate();
    });
    return disposable.dispose;
  }, [pageId, workspace.slots.pagesUpdated, forceUpdate]);

  return workspace.getPage(pageId);
};

export const DetailPage = ({ pageId }: { pageId: string }): ReactElement => {
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);
  const currentSyncEngineStep = useWorkspaceStatus(
    currentWorkspace,
    s => s.engine.sync.step
  );

  // set sync engine priority target
  useEffect(() => {
    currentWorkspace.setPriorityRule(id => id.endsWith(pageId));
  }, [pageId, currentWorkspace]);

  const page = useSafePage(currentWorkspace?.blockSuiteWorkspace, pageId);

  // if sync engine has been synced and the page is null, show 404 page.
  if (currentSyncEngineStep === SyncEngineStep.Synced && !page) {
    return <PageNotFound />;
  }

  if (!page) {
    return <PageDetailSkeleton key="current-page-is-null" />;
  }

  if (page.meta.jumpOnce) {
    currentWorkspace.blockSuiteWorkspace.setPageMeta(page.id, {
      jumpOnce: false,
    });
  }

  return <DetailPageImpl page={page} />;
};

export const Component = () => {
  performanceRenderLogger.info('DetailPage');

  const setCurrentPageId = useSetAtom(currentPageIdAtom);
  const params = useParams();

  useEffect(() => {
    if (params.pageId) {
      localStorage.setItem('last_page_id', params.pageId);
      setCurrentPageId(params.pageId);
    }
  }, [params, setCurrentPageId]);

  const pageId = params.pageId;

  return pageId ? <DetailPage pageId={pageId} /> : null;
};
