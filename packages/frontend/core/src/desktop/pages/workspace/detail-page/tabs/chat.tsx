import { useConfirmModal } from '@affine/component';
import { AIProvider } from '@affine/core/blocksuite/ai';
import type { AppSidebarConfig } from '@affine/core/blocksuite/ai/chat-panel/chat-config';
import {
  AIChatContent,
  type ChatContextValue,
} from '@affine/core/blocksuite/ai/components/ai-chat-content';
import type { ChatStatus } from '@affine/core/blocksuite/ai/components/ai-chat-messages';
import type { AIChatToolbar } from '@affine/core/blocksuite/ai/components/ai-chat-toolbar';
import {
  AIChatTabs,
  configureAIChatToolbar,
  getOrCreateAIChatToolbar,
} from '@affine/core/blocksuite/ai/components/ai-chat-toolbar';
import { createPlaygroundModal } from '@affine/core/blocksuite/ai/components/playground/modal';
import { registerAIAppEffects } from '@affine/core/blocksuite/ai/effects/app';
import type { AffineEditorContainer } from '@affine/core/blocksuite/block-suite-editor';
import { NotificationServiceImpl } from '@affine/core/blocksuite/view-extensions/editor-view/notification-service';
import { useAIChatConfig } from '@affine/core/components/hooks/affine/use-ai-chat-config';
import { useAISpecs } from '@affine/core/components/hooks/affine/use-ai-specs';
import { useAISubscribe } from '@affine/core/components/hooks/affine/use-ai-subscribe';
import {
  AIDraftService,
  AIToolsConfigService,
} from '@affine/core/modules/ai-button';
import { AIModelService } from '@affine/core/modules/ai-button/services/models';
import { ServerService, SubscriptionService } from '@affine/core/modules/cloud';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { useSignalValue } from '@affine/core/modules/doc-info/utils';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { PeekViewService } from '@affine/core/modules/peek-view';
import { AppThemeService } from '@affine/core/modules/theme';
import { WorkbenchService } from '@affine/core/modules/workbench';
import type {
  ContextEmbedStatus,
  CopilotChatHistoryFragment,
  UpdateChatSessionInput,
} from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { RefNodeSlotsProvider } from '@blocksuite/affine/inlines/reference';
import { DocModeProvider } from '@blocksuite/affine/shared/services';
import { createSignalFromObservable } from '@blocksuite/affine/shared/utils';
import { CenterPeekIcon, Logo1Icon } from '@blocksuite/icons/rc';
import type { Signal } from '@preact/signals-core';
import { useFramework, useService } from '@toeverything/infra';
import { html } from 'lit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createSessionDeleteHandler,
  useAIChatOpenTabs,
} from '../../chat-panel-utils';
import * as styles from './chat.css';
import {
  canCreateNewDocPanelSession,
  filterDocPanelTabs,
  getChatContentKey,
  isSessionAvailableInDocPanel,
  resolveInitialSession,
  shouldResetChatPanelOnUserInfoChange,
  type WorkbenchLike,
} from './chat-panel-session';

registerAIAppEffects();

export interface SidebarTabProps {
  editor: AffineEditorContainer | null;
  onLoad?: ((component: HTMLElement) => void) | null;
}

export const EditorChatPanel = ({ editor, onLoad }: SidebarTabProps) => {
  const framework = useFramework();
  const workbench = useService(WorkbenchService).workbench;
  const t = useI18n();

  const { closeConfirmModal, openConfirmModal } = useConfirmModal();
  const notificationService = useMemo(
    () => new NotificationServiceImpl(closeConfirmModal, openConfirmModal),
    [closeConfirmModal, openConfirmModal]
  );
  const specs = useAISpecs();
  const handleAISubscribe = useAISubscribe();

  const {
    docDisplayConfig,
    searchMenuConfig,
    reasoningConfig,
    playgroundConfig,
  } = useAIChatConfig();
  const playgroundVisible = useSignalValue(playgroundConfig.visible) ?? false;

  const [session, setSession] = useState<
    CopilotChatHistoryFragment | null | undefined
  >(undefined);
  const [embeddingProgress, setEmbeddingProgress] = useState<[number, number]>([
    0, 0,
  ]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [hasPinned, setHasPinned] = useState(false);

  const [chatContent, setChatContent] = useState<AIChatContent | null>(null);
  const [chatToolbar, setChatToolbar] = useState<AIChatToolbar | null>(null);
  const [chatTabs, setChatTabs] = useState<AIChatTabs | null>(null);
  const [isBodyProvided, setIsBodyProvided] = useState(false);
  const [isHeaderProvided, setIsHeaderProvided] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const chatToolbarContainerRef = useRef<HTMLDivElement | null>(null);
  const chatTabsContainerRef = useRef<HTMLDivElement | null>(null);
  const contentKeyRef = useRef<string | null>(null);
  const prevSessionIdRef = useRef<string | null>(null);
  const prevSessionDocIdRef = useRef<string | null>(null);
  const lastDocIdRef = useRef<string | null>(null);
  const sessionLoadSeqRef = useRef(0);
  const creatingSessionRef = useRef<{
    docId: string;
    promise: Promise<CopilotChatHistoryFragment | undefined>;
  } | null>(null);
  const creatingFreshSessionRef = useRef<{
    docId: string;
    promise: Promise<void>;
  } | null>(null);
  const userIdRef = useRef<string | null | undefined>(undefined);

  const doc = editor?.doc;
  const host = editor?.host;
  const workspaceId = doc?.workspace.id;

  const [sessionServiceReady, setSessionServiceReady] = useState(
    () => !!AIProvider.session
  );
  const [hasContextMessages, setHasContextMessages] = useState(false);

  useEffect(() => {
    if (sessionServiceReady) return;
    if (AIProvider.session) {
      setSessionServiceReady(true);
      return;
    }
    const sub = AIProvider.slots.sessionReady.subscribe(ready => {
      if (ready) setSessionServiceReady(true);
    });
    return () => sub.unsubscribe();
  }, [sessionServiceReady]);

  const loadSession = useMemo(() => {
    if (!sessionServiceReady || !workspaceId) return null;
    const sessionService = AIProvider.session;
    if (!sessionService) return null;
    return async (
      sessionId: string
    ): Promise<CopilotChatHistoryFragment | null | undefined> =>
      sessionService.getSession(workspaceId, sessionId);
  }, [sessionServiceReady, workspaceId]);

  const { openTabs, setOpenTabs } =
    useAIChatOpenTabs<CopilotChatHistoryFragment>(loadSession);
  const visibleOpenTabs = useMemo(
    () => filterDocPanelTabs(openTabs, doc?.id),
    [doc?.id, openTabs]
  );
  const canCreateNewSession = canCreateNewDocPanelSession({
    hasContextMessages,
    session,
    status,
  });

  const appSidebarConfig = useMemo<AppSidebarConfig>(() => {
    return {
      getWidth: () =>
        createSignalFromObservable<number | undefined>(
          workbench.sidebarWidth$.asObservable(),
          0
        ),
      isOpen: () =>
        createSignalFromObservable<boolean | undefined>(
          workbench.sidebarOpen$.asObservable(),
          true
        ),
    };
  }, [workbench]);

  const [sidebarWidthSignal, setSidebarWidthSignal] =
    useState<Signal<number | undefined>>();

  useEffect(() => {
    const { signal, cleanup } = appSidebarConfig.getWidth();
    setSidebarWidthSignal(signal);
    return cleanup;
  }, [appSidebarConfig]);

  const resetPanel = useCallback(() => {
    sessionLoadSeqRef.current += 1;
    setSession(undefined);
    setEmbeddingProgress([0, 0]);
    setHasPinned(false);
  }, []);

  const initPanel = useCallback(async () => {
    const requestSeq = ++sessionLoadSeqRef.current;
    try {
      const nextSession = await resolveInitialSession({
        sessionService: AIProvider.session ?? undefined,
        doc,
        workbench: workbench as WorkbenchLike,
      });

      if (requestSeq !== sessionLoadSeqRef.current) return;
      if (nextSession === undefined) {
        return;
      }

      setSession(nextSession);
      setHasPinned(!!nextSession?.pinned);
    } catch (error) {
      console.error(error);
    }
  }, [doc, workbench]);

  const createSession = useCallback(
    async (options: Partial<BlockSuitePresets.AICreateSessionOptions> = {}) => {
      if (session || !AIProvider.session || !doc) {
        return session ?? undefined;
      }
      if (creatingSessionRef.current?.docId === doc.id) {
        return creatingSessionRef.current.promise;
      }
      const requestSeq = ++sessionLoadSeqRef.current;
      let promise: Promise<CopilotChatHistoryFragment | undefined>;
      promise = AIProvider.session
        .createSessionWithHistory({
          docId: doc.id,
          workspaceId: doc.workspace.id,
          promptName: 'Chat With AFFiNE AI',
          reuseLatestChat: false,
          ...options,
        })
        .then(nextSession => {
          if (requestSeq !== sessionLoadSeqRef.current) return undefined;
          setSession(nextSession ?? null);
          setHasPinned(!!nextSession?.pinned);
          return nextSession ?? undefined;
        })
        .finally(() => {
          if (creatingSessionRef.current?.promise === promise) {
            creatingSessionRef.current = null;
          }
        });
      creatingSessionRef.current = { docId: doc.id, promise };
      return promise;
    },
    [doc, session]
  );

  const updateSession = useCallback(
    async (options: UpdateChatSessionInput) => {
      if (!AIProvider.session || !doc) {
        return undefined;
      }
      const requestSeq = ++sessionLoadSeqRef.current;
      await AIProvider.session.updateSession(options);
      const nextSession = await AIProvider.session.getSession(
        doc.workspace.id,
        options.sessionId
      );
      if (requestSeq !== sessionLoadSeqRef.current) return undefined;
      setSession(nextSession ?? null);
      setHasPinned(!!nextSession?.pinned);
      return nextSession ?? undefined;
    },
    [doc]
  );

  const newSession = useCallback(async () => {
    if (!canCreateNewSession) {
      return;
    }
    if (doc && creatingFreshSessionRef.current?.docId === doc.id) {
      return creatingFreshSessionRef.current.promise;
    }
    resetPanel();
    const requestSeq = sessionLoadSeqRef.current;
    setSession(null);
    setHasContextMessages(false);

    if (!AIProvider.session || !doc) {
      return;
    }

    let promise: Promise<void>;
    promise = AIProvider.session
      .createSessionWithHistory({
        docId: doc.id,
        workspaceId: doc.workspace.id,
        promptName: 'Chat With AFFiNE AI',
        reuseLatestChat: false,
      })
      .then(nextSession => {
        if (requestSeq === sessionLoadSeqRef.current) {
          setSession(nextSession ?? null);
          setHasPinned(!!nextSession?.pinned);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (creatingFreshSessionRef.current?.promise === promise) {
          creatingFreshSessionRef.current = null;
        }
      });
    creatingFreshSessionRef.current = { docId: doc.id, promise };
    return promise;
  }, [canCreateNewSession, doc, resetPanel]);

  const openSession = useCallback(
    async (sessionId: string) => {
      if (session?.sessionId === sessionId || !AIProvider.session || !doc) {
        return;
      }
      const requestSeq = ++sessionLoadSeqRef.current;
      try {
        const nextSession = await AIProvider.session.getSession(
          doc.workspace.id,
          sessionId
        );
        if (requestSeq !== sessionLoadSeqRef.current) return;
        if (!nextSession) {
          // Drop stale tab if session no longer exists.
          setOpenTabs(prev => prev.filter(tab => tab.sessionId !== sessionId));
          return;
        }
        if (!isSessionAvailableInDocPanel(nextSession, doc.id)) {
          setOpenTabs([]);
          workbench.open(`/${nextSession.docId}?sessionId=${sessionId}`, {
            at: 'active',
          });
          return;
        }
        setSession(nextSession);
        setHasPinned(!!nextSession.pinned);
      } catch (error) {
        console.error(error);
      }
    },
    [doc, session?.sessionId, setOpenTabs, workbench]
  );

  const openDoc = useCallback(
    async (docId: string, sessionId?: string) => {
      if (!doc) {
        return;
      }
      if (doc.id === docId) {
        if (session?.sessionId === sessionId || session?.pinned) {
          return;
        }
        if (sessionId) {
          await openSession(sessionId);
        }
        return;
      }
      if (session?.pinned || !sessionId) {
        workbench.open(`/${docId}`, { at: 'active' });
        return;
      }
      setOpenTabs([]);
      workbench.open(`/${docId}?sessionId=${sessionId}`, { at: 'active' });
    },
    [
      doc,
      openSession,
      session?.pinned,
      session?.sessionId,
      setOpenTabs,
      workbench,
    ]
  );

  const deleteSession = useMemo(
    () =>
      createSessionDeleteHandler({
        t,
        notificationService,
        canDeleteSession: () => Boolean(AIProvider.histories),
        cleanupSession: async sessionToDelete => {
          await AIProvider.histories?.cleanup(
            sessionToDelete.workspaceId,
            sessionToDelete.docId || undefined,
            [sessionToDelete.sessionId]
          );
        },
        isActiveSession: sessionToDelete =>
          sessionToDelete.sessionId === session?.sessionId,
        onActiveSessionDeleted: () => {
          resetPanel();
          setSession(null);
          setHasContextMessages(false);
        },
      }),
    [notificationService, resetPanel, session?.sessionId, t]
  );

  const closeTab = useCallback(
    (sessionId: string) => {
      let fallback: CopilotChatHistoryFragment | undefined;
      setOpenTabs(prev => {
        const idx = prev.findIndex(tab => tab.sessionId === sessionId);
        if (idx === -1) return prev;
        const next = prev.filter(tab => tab.sessionId !== sessionId);
        const visibleNext = filterDocPanelTabs(next, doc?.id);
        fallback = visibleNext[idx] ?? visibleNext[idx - 1] ?? visibleNext[0];
        return next;
      });
      if (session?.sessionId !== sessionId) return;
      if (fallback) {
        openSession(fallback.sessionId).catch(console.error);
      } else {
        resetPanel();
        setSession(null);
        setHasContextMessages(false);
      }
    },
    [doc?.id, openSession, resetPanel, session?.sessionId, setOpenTabs]
  );

  const togglePin = useCallback(async () => {
    const pinned = !session?.pinned;
    setHasPinned(true);
    if (!session) {
      await createSession({ pinned });
      return;
    }
    setSession(prev => (prev ? { ...prev, pinned } : prev));
    await updateSession({
      sessionId: session.sessionId,
      pinned,
    });
  }, [createSession, session, updateSession]);

  const rebindSession = useCallback(async () => {
    if (!session || !doc) {
      return;
    }
    if (session.docId !== doc.id) {
      await updateSession({
        sessionId: session.sessionId,
        docId: doc.id,
      });
    }
  }, [doc, session, updateSession]);

  const onEmbeddingProgressChange = useCallback(
    (count: Record<ContextEmbedStatus, number>) => {
      const total = count.finished + count.processing + count.failed;
      setEmbeddingProgress([count.finished, total]);
    },
    []
  );

  const onContextChange = useCallback(
    (context: Partial<ChatContextValue>) => {
      if (context.status) {
        setStatus(context.status);
      }
      if (context.messages) {
        setHasContextMessages(context.messages.length > 0);
      }
      if (context.status === 'success') {
        rebindSession().catch(console.error);
      }
    },
    [rebindSession]
  );

  useEffect(() => {
    if (session !== undefined) {
      return;
    }
    if (chatContent) {
      chatContent.remove();
      setChatContent(null);
    }
    if (chatToolbar) {
      chatToolbar.remove();
      setChatToolbar(null);
    }
    if (chatTabs) {
      chatTabs.remove();
      setChatTabs(null);
    }
  }, [chatContent, chatTabs, chatToolbar, session]);

  useEffect(() => {
    if (!session?.sessionId) return;
    setOpenTabs(prev => {
      const existing = prev.findIndex(
        tab => tab.sessionId === session.sessionId
      );
      if (existing !== -1) {
        if (prev[existing] === session) return prev;
        const next = prev.slice();
        next[existing] = session;
        return next;
      }
      return [...prev, session];
    });
  }, [session, setOpenTabs]);

  useEffect(() => {
    let disposed = false;
    Promise.resolve(AIProvider.userInfo)
      .then(userInfo => {
        if (!disposed && userIdRef.current === undefined) {
          userIdRef.current = userInfo?.id ?? null;
        }
      })
      .catch(console.error);
    const subscription = AIProvider.slots.userInfo.subscribe(userInfo => {
      const nextUserId = userInfo?.id ?? null;
      const shouldReset = shouldResetChatPanelOnUserInfoChange({
        previousUserId: userIdRef.current,
        nextUserId,
      });
      userIdRef.current = nextUserId;
      if (!shouldReset) {
        return;
      }
      resetPanel();
      initPanel().catch(console.error);
    });
    return () => {
      disposed = true;
      subscription.unsubscribe();
    };
  }, [initPanel, resetPanel]);

  useEffect(() => {
    const docId = doc?.id;
    if (!docId) {
      return;
    }
    if (
      lastDocIdRef.current &&
      lastDocIdRef.current !== docId &&
      !session?.pinned
    ) {
      resetPanel();
      setHasContextMessages(false);
    }
    lastDocIdRef.current = docId;
  }, [doc?.id, resetPanel, session?.pinned]);

  useEffect(() => {
    if (!doc || session !== undefined) {
      return;
    }
    if (AIProvider.session) {
      initPanel().catch(console.error);
      return;
    }
    const subscription = AIProvider.slots.sessionReady.subscribe(ready => {
      if (!ready || session !== undefined) return;
      initPanel().catch(console.error);
    });
    return () => subscription.unsubscribe();
  }, [doc, initPanel, session]);

  const contentKey = getChatContentKey({
    docId: doc?.id,
    hasPinned,
    isGenerating: status === 'loading' || status === 'transmitting',
    previousSessionDocId: prevSessionDocIdRef.current,
    previousSessionId: prevSessionIdRef.current,
    session,
  });

  useEffect(() => {
    if (session?.sessionId) {
      prevSessionIdRef.current = session.sessionId;
      prevSessionDocIdRef.current = session.docId ?? doc?.id ?? null;
    }
  }, [doc?.id, session?.docId, session?.sessionId]);

  useEffect(() => {
    if (!chatContent) {
      contentKeyRef.current = contentKey;
      return;
    }
    if (contentKeyRef.current && contentKeyRef.current !== contentKey) {
      chatContent.remove();
      setChatContent(null);
    }
    contentKeyRef.current = contentKey;
  }, [chatContent, contentKey]);

  useEffect(() => {
    if (!isBodyProvided || !chatContainerRef.current || !doc || !host) {
      return;
    }
    if (session === undefined) {
      return;
    }

    let content = chatContent;

    if (!content) {
      content = new AIChatContent();
    }

    content.host = host;
    content.session = session;
    content.createSession = createSession;
    content.workspaceId = doc.workspace.id;
    content.docId = doc.id;
    content.reasoningConfig = reasoningConfig;
    content.searchMenuConfig = searchMenuConfig;
    content.docDisplayConfig = docDisplayConfig;
    content.extensions = specs;
    content.serverService = framework.get(ServerService);
    content.affineFeatureFlagService = framework.get(FeatureFlagService);
    content.affineWorkspaceDialogService = framework.get(
      WorkspaceDialogService
    );
    content.affineThemeService = framework.get(AppThemeService);
    content.notificationService = notificationService;
    content.aiDraftService = framework.get(AIDraftService);
    content.aiToolsConfigService = framework.get(AIToolsConfigService);
    content.peekViewService = framework.get(PeekViewService);
    content.subscriptionService = framework.get(SubscriptionService);
    content.aiModelService = framework.get(AIModelService);
    content.onAISubscribe = handleAISubscribe;
    content.onEmbeddingProgressChange = onEmbeddingProgressChange;
    content.onContextChange = onContextChange;
    content.width = sidebarWidthSignal;
    content.onOpenDoc = (docId: string, sessionId?: string) => {
      openDoc(docId, sessionId).catch(console.error);
    };

    if (!chatContent) {
      chatContainerRef.current.append(content);
      setChatContent(content);
      onLoad?.(content);
    }
  }, [
    chatContent,
    createSession,
    doc,
    docDisplayConfig,
    framework,
    handleAISubscribe,
    host,
    isBodyProvided,
    notificationService,
    onContextChange,
    onEmbeddingProgressChange,
    onLoad,
    openDoc,
    reasoningConfig,
    searchMenuConfig,
    session,
    sidebarWidthSignal,
    specs,
  ]);

  useEffect(() => {
    if (!isHeaderProvided || !chatToolbarContainerRef.current || !doc) {
      return;
    }
    if (session === undefined) {
      return;
    }

    const tool = getOrCreateAIChatToolbar(chatToolbar);
    configureAIChatToolbar(tool, {
      session,
      workspaceId: doc.workspace.id,
      docId: doc.id,
      status,
      canCreateNewSession,
      docDisplayConfig,
      notificationService,
      onNewSession: () => {
        newSession().catch(console.error);
      },
      onTogglePin: togglePin,
      onOpenSession: (sessionId: string) => {
        openSession(sessionId).catch(console.error);
      },
      onOpenDoc: (docId: string, sessionId: string) => {
        openDoc(docId, sessionId).catch(console.error);
      },
      onSessionDelete: (sessionToDelete: BlockSuitePresets.AIRecentSession) => {
        deleteSession(sessionToDelete).catch(console.error);
      },
    });

    if (!chatToolbar) {
      chatToolbarContainerRef.current.append(tool);
      setChatToolbar(tool);
    }
  }, [
    chatToolbar,
    canCreateNewSession,
    deleteSession,
    doc,
    docDisplayConfig,
    isHeaderProvided,
    newSession,
    notificationService,
    openDoc,
    openSession,
    session,
    status,
    togglePin,
  ]);

  useEffect(() => {
    if (!chatTabsContainerRef.current || !doc) {
      return;
    }
    if (session === undefined) {
      return;
    }

    let tabs = chatTabs;
    if (!tabs) {
      tabs = new AIChatTabs();
      chatTabsContainerRef.current.append(tabs);
      setChatTabs(tabs);
    }
    tabs.sessions = visibleOpenTabs;
    tabs.activeSessionId = session?.sessionId;
    tabs.showDraftTab =
      visibleOpenTabs.length === 0 && !session?.sessionId && !!doc;
    tabs.onSelectTab = (sessionId: string) => {
      openSession(sessionId).catch(console.error);
    };
    tabs.onCloseTab = (sessionId: string) => {
      closeTab(sessionId);
    };
  }, [chatTabs, closeTab, doc, openSession, session, visibleOpenTabs]);

  useEffect(() => {
    if (!editor?.host || !chatContent) {
      return;
    }
    const docModeService = editor.host.std.get(DocModeProvider);
    const refNodeService = editor.host.std.getOptional(RefNodeSlotsProvider);
    const disposable = [
      refNodeService?.docLinkClicked.subscribe(({ host: clickedHost }) => {
        if (clickedHost === editor.host) {
          chatContent.docId = editor.doc.id;
        }
      }),
      docModeService?.onPrimaryModeChange(() => {
        if (!editor.host) {
          return;
        }
        chatContent.host = editor.host;
      }, editor.doc.id),
    ];

    return () => disposable.forEach(item => item?.unsubscribe());
  }, [chatContent, editor]);

  const [autoResized, setAutoResized] = useState(false);
  useEffect(() => {
    if (autoResized) {
      return;
    }
    const subscription = AIProvider.slots.previewPanelOpenChange.subscribe(
      open => {
        if (!open) {
          return;
        }
        const sidebarWidth = workbench.sidebarWidth$.value;
        const minSidebarWidth = 1080;
        if (!sidebarWidth || sidebarWidth < minSidebarWidth) {
          workbench.setSidebarWidth(minSidebarWidth);
          setAutoResized(true);
        }
      }
    );
    return () => {
      subscription.unsubscribe();
    };
  }, [autoResized, workbench]);

  const openPlayground = useCallback(() => {
    if (!doc || !host) {
      return;
    }
    const playgroundContent = html`
      <playground-content
        .host=${host}
        .doc=${doc}
        .reasoningConfig=${reasoningConfig}
        .playgroundConfig=${playgroundConfig}
        .appSidebarConfig=${appSidebarConfig}
        .searchMenuConfig=${searchMenuConfig}
        .docDisplayConfig=${docDisplayConfig}
        .extensions=${specs}
        .serverService=${framework.get(ServerService)}
        .affineFeatureFlagService=${framework.get(FeatureFlagService)}
        .affineThemeService=${framework.get(AppThemeService)}
        .notificationService=${notificationService}
        .affineWorkspaceDialogService=${framework.get(WorkspaceDialogService)}
        .aiToolsConfigService=${framework.get(AIToolsConfigService)}
        .subscriptionService=${framework.get(SubscriptionService)}
        .aiModelService=${framework.get(AIModelService)}
      ></playground-content>
    `;

    createPlaygroundModal(playgroundContent, 'AI Playground');
  }, [
    appSidebarConfig,
    doc,
    docDisplayConfig,
    framework,
    host,
    notificationService,
    playgroundConfig,
    reasoningConfig,
    searchMenuConfig,
    specs,
  ]);

  const onChatContainerRef = useCallback((node: HTMLDivElement) => {
    if (!node) {
      return;
    }
    setIsBodyProvided(true);
    chatContainerRef.current = node;
  }, []);

  const onChatToolContainerRef = useCallback((node: HTMLDivElement) => {
    if (!node) {
      return;
    }
    setIsHeaderProvided(true);
    chatToolbarContainerRef.current = node;
  }, []);

  const onChatTabsContainerRef = useCallback((node: HTMLDivElement | null) => {
    chatTabsContainerRef.current = node;
  }, []);

  const isEmbedding =
    embeddingProgress[1] > 0 && embeddingProgress[0] < embeddingProgress[1];
  const [done, total] = embeddingProgress;
  const isInitialized = session !== undefined;

  return (
    <div className={styles.root}>
      {!isInitialized ? (
        <div className={styles.loadingContainer}>
          <div className={styles.loading}>
            <Logo1Icon className={styles.loadingIcon} />
            <div className={styles.loadingTitle}>
              {t['com.affine.ai.chat-panel.loading-history']()}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.container}>
          <div className={styles.header}>
            <div className={styles.title}>
              {isEmbedding ? (
                <span data-testid="chat-panel-embedding-progress">
                  {t.t('com.affine.ai.chat-panel.embedding-progress', {
                    done,
                    total,
                  })}
                </span>
              ) : (
                t['com.affine.ai.chat-panel.title']()
              )}
            </div>
            {playgroundVisible ? (
              <div className={styles.playground} onClick={openPlayground}>
                <CenterPeekIcon />
              </div>
            ) : null}
            <div
              className={styles.tabsContainer}
              ref={onChatTabsContainerRef}
            />
            <div ref={onChatToolContainerRef} />
          </div>
          <div className={styles.content} ref={onChatContainerRef} />
        </div>
      )}
    </div>
  );
};
