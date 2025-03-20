import { Scrollable } from '@affine/component';
import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import type { ChatPanel } from '@affine/core/blocksuite/ai';
import { AIProvider } from '@affine/core/blocksuite/ai';
import type { AffineEditorContainer } from '@affine/core/blocksuite/block-suite-editor';
import { EditorOutlineViewer } from '@affine/core/blocksuite/outline-viewer';
import { PageAIOnboarding } from '@affine/core/components/affine/ai-onboarding';
import { DocPropertySidebar } from '@affine/core/components/doc-properties/sidebar';
import { useAppSettingHelper } from '@affine/core/components/hooks/affine/use-app-setting-helper';
import { useEnableAI } from '@affine/core/components/hooks/affine/use-enable-ai';
import { DocService } from '@affine/core/modules/doc';
import { EditorService } from '@affine/core/modules/editor';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { PeekViewService } from '@affine/core/modules/peek-view';
import { GuardService } from '@affine/core/modules/permissions';
import { RecentDocsService } from '@affine/core/modules/quicksearch';
import { ViewService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { isNewTabTrigger } from '@affine/core/utils';
import track from '@affine/track';
import { DisposableGroup } from '@blocksuite/affine/global/disposable';
import { RefNodeSlotsProvider } from '@blocksuite/affine/inlines/reference';
import {
  AiIcon,
  FrameIcon,
  PropertyIcon,
  TocIcon,
  TodayIcon,
} from '@blocksuite/icons/rc';
import {
  FrameworkScope,
  useLiveData,
  useService,
  useServices,
} from '@toeverything/infra';
import clsx from 'clsx';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Subscription } from 'rxjs';

import { AffineErrorBoundary } from '../../../../components/affine/affine-error-boundary';
import { GlobalPageHistoryModal } from '../../../../components/affine/page-history-modal';
import { useRegisterBlocksuiteEditorCommands } from '../../../../components/hooks/affine/use-register-blocksuite-editor-commands';
import { useActiveBlocksuiteEditor } from '../../../../components/hooks/use-block-suite-editor';
import { PageDetailEditor } from '../../../../components/page-detail-editor';
import { TrashPageFooter } from '../../../../components/pure/trash-page-footer';
import { TopTip } from '../../../../components/top-tip';
import {
  useIsActiveView,
  ViewBody,
  ViewHeader,
  ViewSidebarTab,
  WorkbenchService,
} from '../../../../modules/workbench';
import { PageNotFound } from '../../404';
import * as styles from './detail-page.css';
import { DetailPageHeader } from './detail-page-header';
import { DetailPageWrapper } from './detail-page-wrapper';
import { EditorChatPanel } from './tabs/chat';
import { EditorFramePanel } from './tabs/frame';
import { EditorJournalPanel } from './tabs/journal';
import { EditorOutlinePanel } from './tabs/outline';

const DetailPageImpl = memo(function DetailPageImpl() {
  const {
    workbenchService,
    viewService,
    editorService,
    docService,
    workspaceService,
    globalContextService,
    guardService,
  } = useServices({
    WorkbenchService,
    ViewService,
    EditorService,
    DocService,
    WorkspaceService,
    GlobalContextService,
    GuardService,
  });
  const workbench = workbenchService.workbench;
  const editor = editorService.editor;
  const view = viewService.view;
  const workspace = workspaceService.workspace;
  const globalContext = globalContextService.globalContext;
  const doc = docService.doc;

  const mode = useLiveData(editor.mode$);
  const activeSidebarTab = useLiveData(view.activeSidebarTab$);

  const isInTrash = useLiveData(doc.meta$.map(meta => meta.trash));
  const editorContainer = useLiveData(editor.editorContainer$);

  const isSideBarOpen = useLiveData(workbench.sidebarOpen$);
  const { appSettings } = useAppSettingHelper();
  const chatPanelRef = useRef<ChatPanel | null>(null);

  const peekView = useService(PeekViewService).peekView;

  const isActiveView = useIsActiveView();
  // TODO(@eyhn): remove jotai here
  const [_, setActiveBlockSuiteEditor] = useActiveBlocksuiteEditor();

  const enableAI = useEnableAI();

  useEffect(() => {
    if (isActiveView) {
      setActiveBlockSuiteEditor(editorContainer);
    }
  }, [editorContainer, isActiveView, setActiveBlockSuiteEditor]);

  useEffect(() => {
    const disposables: Subscription[] = [];
    const openHandler = () => {
      workbench.openSidebar();
      view.activeSidebarTab('chat');
    };
    disposables.push(
      AIProvider.slots.requestOpenWithChat.subscribe(openHandler)
    );
    disposables.push(
      AIProvider.slots.requestSendWithChat.subscribe(openHandler)
    );
    return () => disposables.forEach(d => d.unsubscribe());
  }, [activeSidebarTab, view, workbench]);

  useEffect(() => {
    if (isActiveView) {
      globalContext.docId.set(doc.id);
      globalContext.isDoc.set(true);

      return () => {
        globalContext.docId.set(null);
        globalContext.isDoc.set(false);
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

  useEffect(() => {
    if (isActiveView) {
      globalContext.isTrashDoc.set(!!isInTrash);

      return () => {
        globalContext.isTrashDoc.set(null);
      };
    }
    return;
  }, [globalContext, isActiveView, isInTrash]);

  useRegisterBlocksuiteEditorCommands(editor, isActiveView);

  const onLoad = useCallback(
    (editorContainer: AffineEditorContainer) => {
      const std = editorContainer.std;
      const disposable = new DisposableGroup();
      if (std) {
        const refNodeSlots = std.getOptional(RefNodeSlotsProvider);
        if (refNodeSlots) {
          disposable.add(
            // the event should not be emitted by AffineReference
            refNodeSlots.docLinkClicked.subscribe(
              ({ pageId, params, openMode, event, host }) => {
                if (host !== editorContainer.host) {
                  return;
                }
                openMode ??=
                  event && isNewTabTrigger(event)
                    ? 'open-in-new-tab'
                    : 'open-in-active-view';

                if (openMode === 'open-in-new-view') {
                  track.doc.editor.toolbar.openInSplitView();
                } else if (openMode === 'open-in-center-peek') {
                  track.doc.editor.toolbar.openInPeekView();
                } else if (openMode === 'open-in-new-tab') {
                  track.doc.editor.toolbar.openInNewTab();
                }

                if (openMode !== 'open-in-center-peek') {
                  const at = (() => {
                    if (openMode === 'open-in-active-view') {
                      return 'active';
                    }
                    // split view is only supported on electron
                    if (openMode === 'open-in-new-view') {
                      return BUILD_CONFIG.isElectron ? 'tail' : 'new-tab';
                    }
                    if (openMode === 'open-in-new-tab') {
                      return 'new-tab';
                    }
                    return 'active';
                  })();
                  workbench.openDoc(
                    {
                      docId: pageId,
                      blockIds: params?.blockIds,
                      elementIds: params?.elementIds,
                    },
                    {
                      at: at,
                      show: true,
                    }
                  );
                } else {
                  peekView
                    .open({
                      docRef: {
                        docId: pageId,
                      },
                      ...params,
                    })
                    .catch(console.error);
                }
              }
            )
          );
        }
      }

      const unbind = editor.bindEditorContainer(
        editorContainer,
        (editorContainer as any).docTitle, // set from proxy
        scrollViewportRef.current
      );

      return () => {
        unbind();
        disposable.dispose();
      };
    },
    [editor, workbench, peekView]
  );

  const [hasScrollTop, setHasScrollTop] = useState(false);

  const openOutlinePanel = useCallback(() => {
    workbench.openSidebar();
    view.activeSidebarTab('outline');
  }, [workbench, view]);

  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;

    const hasScrollTop = scrollTop > 0;
    setHasScrollTop(hasScrollTop);
  }, []);

  const [dragging, setDragging] = useState(false);

  const canEdit = useLiveData(guardService.can$('Doc_Update', doc.id));

  const readonly = !canEdit || isInTrash;

  return (
    <FrameworkScope scope={editor.scope}>
      <ViewHeader>
        <DetailPageHeader
          page={doc.blockSuiteDoc}
          workspace={workspace}
          onDragging={setDragging}
        />
      </ViewHeader>
      <ViewBody>
        <div
          className={styles.mainContainer}
          data-dynamic-top-border={BUILD_CONFIG.isElectron}
          data-has-scroll-top={hasScrollTop}
        >
          {/* Add a key to force rerender when page changed, to avoid error boundary persisting. */}
          <AffineErrorBoundary key={doc.id}>
            <TopTip pageId={doc.id} workspace={workspace} />
            <Scrollable.Root>
              <Scrollable.Viewport
                onScroll={handleScroll}
                ref={scrollViewportRef}
                data-dragging={dragging}
                className={clsx(
                  'affine-page-viewport',
                  styles.affineDocViewport,
                  styles.editorContainer
                )}
              >
                <PageDetailEditor onLoad={onLoad} readonly={readonly} />
              </Scrollable.Viewport>
              <Scrollable.Scrollbar
                className={clsx({
                  [styles.scrollbar]: !appSettings.clientBorder,
                })}
              />
            </Scrollable.Root>
            <EditorOutlineViewer
              editor={editorContainer?.host ?? null}
              show={mode === 'page' && !isSideBarOpen}
              openOutlinePanel={openOutlinePanel}
            />
          </AffineErrorBoundary>
          {isInTrash ? <TrashPageFooter /> : null}
        </div>
      </ViewBody>

      {enableAI && (
        <ViewSidebarTab
          tabId="chat"
          icon={<AiIcon />}
          unmountOnInactive={false}
        >
          <EditorChatPanel editor={editorContainer} ref={chatPanelRef} />
        </ViewSidebarTab>
      )}

      <ViewSidebarTab tabId="properties" icon={<PropertyIcon />}>
        <Scrollable.Root className={styles.sidebarScrollArea}>
          <Scrollable.Viewport>
            <DocPropertySidebar />
          </Scrollable.Viewport>
          <Scrollable.Scrollbar />
        </Scrollable.Root>
      </ViewSidebarTab>

      <ViewSidebarTab tabId="journal" icon={<TodayIcon />}>
        <Scrollable.Root className={styles.sidebarScrollArea}>
          <Scrollable.Viewport>
            <EditorJournalPanel />
          </Scrollable.Viewport>
          <Scrollable.Scrollbar />
        </Scrollable.Root>
      </ViewSidebarTab>

      <ViewSidebarTab tabId="outline" icon={<TocIcon />}>
        <Scrollable.Root className={styles.sidebarScrollArea}>
          <Scrollable.Viewport>
            <EditorOutlinePanel editor={editorContainer?.host ?? null} />
          </Scrollable.Viewport>
          <Scrollable.Scrollbar />
        </Scrollable.Root>
      </ViewSidebarTab>

      <ViewSidebarTab tabId="frame" icon={<FrameIcon />}>
        <Scrollable.Root className={styles.sidebarScrollArea}>
          <Scrollable.Viewport>
            <EditorFramePanel editor={editorContainer?.host ?? null} />
          </Scrollable.Viewport>
          <Scrollable.Scrollbar />
        </Scrollable.Root>
      </ViewSidebarTab>

      <GlobalPageHistoryModal />
      <PageAIOnboarding />
    </FrameworkScope>
  );
});

export const Component = () => {
  const params = useParams();
  const recentPages = useService(RecentDocsService);
  const guardService = useService(GuardService);

  useEffect(() => {
    if (params.pageId) {
      const pageId = params.pageId;
      localStorage.setItem('last_page_id', pageId);

      recentPages.addRecentDoc(pageId);
    }
  }, [params, recentPages]);

  const pageId = params.pageId;
  const canAccess = useLiveData(
    pageId ? guardService.can$('Doc_Read', pageId) : undefined
  );

  return pageId ? (
    <DetailPageWrapper
      pageId={pageId}
      canAccess={canAccess}
      skeleton={<PageDetailSkeleton />}
      notFound={<PageNotFound noPermission />}
    >
      <DetailPageImpl />
    </DetailPageWrapper>
  ) : null;
};
