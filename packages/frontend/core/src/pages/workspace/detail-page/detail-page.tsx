import { Scrollable } from '@affine/component';
import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import { AIProvider } from '@affine/core/blocksuite/presets/ai';
import { PageAIOnboarding } from '@affine/core/components/affine/ai-onboarding';
import { AIIsland } from '@affine/core/components/pure/ai-island';
import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { RecentPagesService } from '@affine/core/modules/cmdk';
import type { PageRootService } from '@blocksuite/blocks';
import {
  BookmarkBlockService,
  customImageProxyMiddleware,
  EmbedGithubBlockService,
  EmbedLoomBlockService,
  EmbedYoutubeBlockService,
  ImageBlockService,
} from '@blocksuite/blocks';
import { DisposableGroup } from '@blocksuite/global/utils';
import { type AffineEditorContainer } from '@blocksuite/presets';
import type { Doc as BlockSuiteDoc } from '@blocksuite/store';
import type { Doc } from '@toeverything/infra';
import {
  DocService,
  DocsService,
  FrameworkScope,
  globalBlockSuiteSchema,
  GlobalContextService,
  useLiveData,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import clsx from 'clsx';
import type { ReactElement } from 'react';
import { memo, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Map as YMap } from 'yjs';

import { AffineErrorBoundary } from '../../../components/affine/affine-error-boundary';
import { GlobalPageHistoryModal } from '../../../components/affine/page-history-modal';
import { PageDetailEditor } from '../../../components/page-detail-editor';
import { TrashPageFooter } from '../../../components/pure/trash-page-footer';
import { TopTip } from '../../../components/top-tip';
import { useRegisterBlocksuiteEditorCommands } from '../../../hooks/affine/use-register-blocksuite-editor-commands';
import { useActiveBlocksuiteEditor } from '../../../hooks/use-block-suite-editor';
import { usePageDocumentTitle } from '../../../hooks/use-global-state';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import {
  MultiTabSidebarBody,
  MultiTabSidebarHeaderSwitcher,
  sidebarTabs,
} from '../../../modules/multi-tab-sidebar';
import {
  RightSidebarService,
  RightSidebarViewIsland,
} from '../../../modules/right-sidebar';
import {
  useIsActiveView,
  ViewBodyIsland,
  ViewHeaderIsland,
} from '../../../modules/workbench';
import { performanceRenderLogger } from '../../../shared';
import { PageNotFound } from '../../404';
import * as styles from './detail-page.css';
import { DetailPageHeader } from './detail-page-header';

const DetailPageImpl = memo(function DetailPageImpl() {
  const rightSidebar = useService(RightSidebarService).rightSidebar;
  const activeTabName = useLiveData(rightSidebar.activeTabName$);

  const doc = useService(DocService).doc;
  const { openPage, jumpToPageBlock, jumpToTag } = useNavigateHelper();
  const [editor, setEditor] = useState<AffineEditorContainer | null>(null);
  const workspace = useService(WorkspaceService).workspace;
  const globalContext = useService(GlobalContextService).globalContext;
  const docCollection = workspace.docCollection;
  const mode = useLiveData(doc.mode$);
  const { appSettings } = useAppSettingHelper();
  const [tabOnLoad, setTabOnLoad] = useState<
    ((component: HTMLElement) => void) | null
  >(null);

  const isActiveView = useIsActiveView();
  // TODO(@eyhn): remove jotai here
  const [_, setActiveBlockSuiteEditor] = useActiveBlocksuiteEditor();

  const setActiveTabName = useCallback(
    (...args: Parameters<typeof rightSidebar.setActiveTabName>) =>
      rightSidebar.setActiveTabName(...args),
    [rightSidebar]
  );

  useEffect(() => {
    if (isActiveView) {
      setActiveBlockSuiteEditor(editor);
    }
  }, [editor, isActiveView, setActiveBlockSuiteEditor]);

  useEffect(() => {
    const disposable = AIProvider.slots.requestOpenWithChat.on(params => {
      const opened = rightSidebar.isOpen$.value;
      const actived = activeTabName === 'chat';

      if (!opened) {
        rightSidebar.open();
      }
      if (!actived) {
        setActiveTabName('chat');
      }

      // Save chat parameters:
      // * The right sidebar is not open
      // * Chat panel is not activated
      if (!opened || !actived) {
        const callback = async (chatPanel: HTMLElement) => {
          const chatCards = await AIProvider.requestChatCardsElement(chatPanel);
          if (!chatCards) return;
          if (chatCards.temporaryParams) return;
          chatCards.temporaryParams = params;
        };
        setTabOnLoad(() => callback);
      } else {
        setTabOnLoad(null);
      }
    });
    return disposable.dispose();
  }, [activeTabName, rightSidebar, setActiveTabName]);

  useEffect(() => {
    if (isActiveView) {
      globalContext.docId.set(doc.id);

      return () => {
        globalContext.docId.set(null);
      };
    }
    return;
  }, [doc, globalContext, isActiveView]);

  useEffect(() => {
    if (isActiveView) {
      globalContext.docMode.set(mode);

      return () => {
        globalContext.docMode.set(null);
      };
    }
    return;
  }, [doc, globalContext, isActiveView, mode]);

  const isInTrash = useLiveData(doc.meta$.map(meta => meta.trash));
  useRegisterBlocksuiteEditorCommands();
  const title = useLiveData(doc.title$);
  usePageDocumentTitle(title);

  const onLoad = useCallback(
    (bsPage: BlockSuiteDoc, editor: AffineEditorContainer) => {
      try {
        // todo(joooye34): improve the following migration code
        const surfaceBlock = bsPage.getBlockByFlavour('affine:surface')[0];
        // hotfix for old page
        if (
          surfaceBlock &&
          (surfaceBlock.yBlock.get('prop:elements') as YMap<any>).get(
            'type'
          ) !== '$blocksuite:internal:native$'
        ) {
          globalBlockSuiteSchema.upgradeDoc(
            0,
            {
              'affine:surface': 3,
            },
            bsPage.spaceDoc
          );
        }
      } catch {}

      // blocksuite editor host
      const editorHost = editor.host;

      // provide image proxy endpoint to blocksuite
      editorHost.std.clipboard.use(
        customImageProxyMiddleware(runtimeConfig.imageProxyUrl)
      );
      ImageBlockService.setImageProxyURL(runtimeConfig.imageProxyUrl);

      // provide link preview endpoint to blocksuite
      BookmarkBlockService.setLinkPreviewEndpoint(runtimeConfig.linkPreviewUrl);
      EmbedGithubBlockService.setLinkPreviewEndpoint(
        runtimeConfig.linkPreviewUrl
      );
      EmbedYoutubeBlockService.setLinkPreviewEndpoint(
        runtimeConfig.linkPreviewUrl
      );
      EmbedLoomBlockService.setLinkPreviewEndpoint(
        runtimeConfig.linkPreviewUrl
      );

      // provide page mode and updated date to blocksuite
      const pageService =
        editorHost.std.spec.getService<PageRootService>('affine:page');
      const disposable = new DisposableGroup();

      doc.setMode(mode);
      disposable.add(
        pageService.slots.docLinkClicked.on(({ docId, blockId }) => {
          return blockId
            ? jumpToPageBlock(docCollection.id, docId, blockId)
            : openPage(docCollection.id, docId);
        })
      );
      disposable.add(
        pageService.slots.tagClicked.on(({ tagId }) => {
          jumpToTag(workspace.id, tagId);
        })
      );

      setEditor(editor);

      return () => {
        disposable.dispose();
      };
    },
    [
      doc,
      mode,
      jumpToPageBlock,
      docCollection.id,
      openPage,
      jumpToTag,
      workspace.id,
    ]
  );

  const isWindowsDesktop = environment.isDesktop && environment.isWindows;

  return (
    <>
      <ViewHeaderIsland>
        <DetailPageHeader page={doc.blockSuiteDoc} workspace={workspace} />
      </ViewHeaderIsland>
      <ViewBodyIsland>
        <div className={styles.mainContainer}>
          <AIIsland />
          {/* Add a key to force rerender when page changed, to avoid error boundary persisting. */}
          <AffineErrorBoundary key={doc.id}>
            <TopTip pageId={doc.id} workspace={workspace} />
            <Scrollable.Root>
              <Scrollable.Viewport
                className={clsx(
                  'affine-page-viewport',
                  styles.affineDocViewport,
                  styles.editorContainer
                )}
              >
                <PageDetailEditor
                  pageId={doc.id}
                  onLoad={onLoad}
                  docCollection={docCollection}
                />
              </Scrollable.Viewport>
              <Scrollable.Scrollbar
                className={clsx({
                  [styles.scrollbar]: !appSettings.clientBorder,
                })}
              />
            </Scrollable.Root>
          </AffineErrorBoundary>
          {isInTrash ? <TrashPageFooter /> : null}
        </div>
      </ViewBodyIsland>

      <RightSidebarViewIsland
        active={isActiveView}
        header={
          !isWindowsDesktop ? (
            <MultiTabSidebarHeaderSwitcher
              activeTabName={activeTabName ?? sidebarTabs[0]?.name}
              setActiveTabName={setActiveTabName}
              tabs={sidebarTabs}
            />
          ) : null
        }
        body={
          <MultiTabSidebarBody
            editor={editor}
            tab={
              sidebarTabs.find(ext => ext.name === activeTabName) ??
              sidebarTabs[0]
            }
            onLoad={tabOnLoad}
          >
            {/* Show switcher in body for windows desktop */}
            {isWindowsDesktop && (
              <MultiTabSidebarHeaderSwitcher
                activeTabName={activeTabName ?? sidebarTabs[0]?.name}
                setActiveTabName={setActiveTabName}
                tabs={sidebarTabs}
              />
            )}
          </MultiTabSidebarBody>
        }
      />
      <GlobalPageHistoryModal />
      <PageAIOnboarding />
    </>
  );
});

export const DetailPage = ({ pageId }: { pageId: string }): ReactElement => {
  const currentWorkspace = useService(WorkspaceService).workspace;
  const docsService = useService(DocsService);
  const docRecordList = docsService.list;
  const docListReady = useLiveData(docRecordList.isReady$);
  const docRecord = docRecordList.doc$(pageId).value;

  const [doc, setDoc] = useState<Doc | null>(null);

  useLayoutEffect(() => {
    if (!docRecord) {
      return;
    }
    const { doc: opened, release } = docsService.open(pageId);
    setDoc(opened);
    return () => {
      release();
    };
  }, [docRecord, docsService, pageId]);

  // set sync engine priority target
  useEffect(() => {
    currentWorkspace.engine.doc.setPriority(pageId, 10);
    return () => {
      currentWorkspace.engine.doc.setPriority(pageId, 5);
    };
  }, [currentWorkspace, pageId]);

  const isInTrash = useLiveData(doc?.meta$.map(meta => meta.trash));

  useEffect(() => {
    if (doc && isInTrash) {
      currentWorkspace.docCollection.awarenessStore.setReadonly(
        doc.blockSuiteDoc.blockCollection,
        true
      );
    }
  }, [currentWorkspace.docCollection.awarenessStore, doc, isInTrash]);

  // if sync engine has been synced and the page is null, show 404 page.
  if (docListReady && !doc) {
    return <PageNotFound noPermission />;
  }

  if (!doc) {
    return <PageDetailSkeleton key="current-page-is-null" />;
  }

  return (
    <FrameworkScope scope={doc.scope}>
      <DetailPageImpl />
    </FrameworkScope>
  );
};

export const Component = () => {
  performanceRenderLogger.debug('DetailPage');

  const params = useParams();
  const recentPages = useService(RecentPagesService);

  useEffect(() => {
    if (params.pageId) {
      const pageId = params.pageId;
      localStorage.setItem('last_page_id', pageId);

      recentPages.addRecentDoc(pageId);
    }
  }, [params, recentPages]);

  const pageId = params.pageId;

  return pageId ? <DetailPage pageId={pageId} /> : null;
};
