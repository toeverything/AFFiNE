import { observeResize, useConfirmModal } from '@affine/component';
import { CopilotClient } from '@affine/core/blocksuite/ai';
import {
  AIChatContent,
  type ChatContextValue,
} from '@affine/core/blocksuite/ai/components/ai-chat-content';
import type { ChatStatus } from '@affine/core/blocksuite/ai/components/ai-chat-messages';
import {
  AIChatToolbar,
  configureAIChatToolbar,
  getOrCreateAIChatToolbar,
} from '@affine/core/blocksuite/ai/components/ai-chat-toolbar';
import type { PromptKey } from '@affine/core/blocksuite/ai/provider/prompt';
import { getViewManager } from '@affine/core/blocksuite/manager/view';
import { NotificationServiceImpl } from '@affine/core/blocksuite/view-extensions/editor-view/notification-service';
import { useAIChatConfig } from '@affine/core/components/hooks/affine/use-ai-chat-config';
import { useAISpecs } from '@affine/core/components/hooks/affine/use-ai-specs';
import { useAISubscribe } from '@affine/core/components/hooks/affine/use-ai-subscribe';
import {
  AIDraftService,
  AIToolsConfigService,
} from '@affine/core/modules/ai-button';
import { AIModelService } from '@affine/core/modules/ai-button/services/models';
import {
  EventSourceService,
  FetchService,
  GraphQLService,
  ServerService,
  SubscriptionService,
} from '@affine/core/modules/cloud';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { PeekViewService } from '@affine/core/modules/peek-view';
import { AppThemeService } from '@affine/core/modules/theme';
import {
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewService,
  ViewTitle,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { RefNodeSlotsProvider } from '@blocksuite/affine/inlines/reference';
import { BlockStdScope } from '@blocksuite/affine/std';
import type { Workspace } from '@blocksuite/affine/store';
import { type Signal, signal } from '@preact/signals-core';
import { useFramework, useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createSessionDeleteHandler } from '../chat-panel-utils';
import * as styles from './index.css';

type CopilotSession = Awaited<ReturnType<CopilotClient['getSession']>>;

function useCopilotClient() {
  const graphqlService = useService(GraphQLService);
  const eventSourceService = useService(EventSourceService);
  const fetchService = useService(FetchService);

  return useMemo(
    () =>
      new CopilotClient(
        graphqlService.gql,
        fetchService.fetch,
        eventSourceService.eventSource
      ),
    [graphqlService, eventSourceService, fetchService]
  );
}

function createMockStd(workspace: Workspace) {
  workspace.meta.initialize();
  // just pick a random doc for now
  const store = workspace.docs.values().next().value?.getStore();
  if (!store) return null;
  const std = new BlockStdScope({
    store,
    extensions: [...getViewManager().config.init().value.get('page')],
  });
  std.render();
  return std;
}

function useMockStd() {
  const workspace = useService(WorkspaceService).workspace;
  const std = useMemo(() => {
    if (!workspace) return null;
    return createMockStd(workspace.docCollection);
  }, [workspace]);
  return std;
}

export const Component = () => {
  const t = useI18n();
  const framework = useFramework();
  const [isBodyProvided, setIsBodyProvided] = useState(false);
  const [isHeaderProvided, setIsHeaderProvided] = useState(false);
  const [chatContent, setChatContent] = useState<AIChatContent | null>(null);
  const [chatTool, setChatTool] = useState<AIChatToolbar | null>(null);
  const [currentSession, setCurrentSession] = useState<CopilotSession | null>(
    null
  );
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [isTogglingPin, setIsTogglingPin] = useState(false);
  const [isOpeningSession, setIsOpeningSession] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatToolContainerRef = useRef<HTMLDivElement>(null);
  const widthSignalRef = useRef<Signal<number>>(signal(0));
  const client = useCopilotClient();
  const workbench = useService(WorkbenchService).workbench;

  const workspaceId = useService(WorkspaceService).workspace.id;

  const { docDisplayConfig, searchMenuConfig, reasoningConfig } =
    useAIChatConfig();

  const createSession = useCallback(
    async (options: Partial<BlockSuitePresets.AICreateSessionOptions> = {}) => {
      if (currentSession) {
        return currentSession;
      }
      const sessionId = await client.createSession({
        workspaceId,
        promptName: 'Chat With AFFiNE AI' satisfies PromptKey,
        reuseLatestChat: false,
        ...options,
      });

      const session = await client.getSession(workspaceId, sessionId);
      setCurrentSession(session);
      return session;
    },
    [client, currentSession, workspaceId]
  );

  const togglePin = useCallback(async () => {
    if (isTogglingPin) return;
    setIsTogglingPin(true);
    try {
      const pinned = !currentSession?.pinned;
      if (!currentSession) {
        await createSession({ pinned });
      } else {
        await client.updateSession({
          sessionId: currentSession.sessionId,
          pinned,
        });
        // retrieve the latest session and update the state
        const session = await client.getSession(
          workspaceId,
          currentSession.sessionId
        );
        setCurrentSession(session);
      }
    } finally {
      setIsTogglingPin(false);
    }
  }, [client, createSession, currentSession, isTogglingPin, workspaceId]);

  // remove the old content to trigger re-mount
  // to avoid infinitely load and mount, should not make `chatContent` as dependency
  const reMountChatContent = useCallback(() => {
    setChatContent(prev => {
      prev?.remove();
      return null;
    });
  }, []);

  const onOpenSession = useCallback(
    (sessionId: string) => {
      if (isOpeningSession) return;
      setIsOpeningSession(true);
      client
        .getSession(workspaceId, sessionId)
        .then(session => {
          setCurrentSession(session);
          reMountChatContent();
          chatTool?.closeHistoryMenu();
        })
        .catch(console.error)
        .finally(() => {
          setIsOpeningSession(false);
        });
    },
    [chatTool, client, isOpeningSession, reMountChatContent, workspaceId]
  );

  const onContextChange = useCallback((context: Partial<ChatContextValue>) => {
    setStatus(context.status ?? 'idle');
  }, []);

  const onOpenDoc = useCallback(
    (docId: string) => {
      workbench.openDoc(docId, { at: 'active' });
    },
    [workbench]
  );

  const confirmModal = useConfirmModal();
  const notificationService = useMemo(
    () =>
      new NotificationServiceImpl(
        confirmModal.closeConfirmModal,
        confirmModal.openConfirmModal
      ),
    [confirmModal.closeConfirmModal, confirmModal.openConfirmModal]
  );
  const specs = useAISpecs();
  const mockStd = useMockStd();
  const handleAISubscribe = useAISubscribe();

  const deleteSession = useMemo(
    () =>
      createSessionDeleteHandler({
        t,
        notificationService,
        cleanupSession: async sessionToDelete => {
          await client.cleanupSessions({
            workspaceId: sessionToDelete.workspaceId,
            docId: sessionToDelete.docId || undefined,
            sessionIds: [sessionToDelete.sessionId],
          });
        },
        isActiveSession: sessionToDelete =>
          sessionToDelete.sessionId === currentSession?.sessionId,
        onActiveSessionDeleted: () => {
          setCurrentSession(null);
          reMountChatContent();
        },
      }),
    [
      client,
      currentSession?.sessionId,
      notificationService,
      reMountChatContent,
      t,
    ]
  );

  // init or update ai-chat-content
  useEffect(() => {
    if (!isBodyProvided) {
      return;
    }

    let content = chatContent;

    if (!content) {
      content = new AIChatContent();
    }

    content.session = currentSession;
    content.workspaceId = workspaceId;
    content.extensions = specs;
    content.host = mockStd?.host;
    content.docDisplayConfig = docDisplayConfig;
    content.searchMenuConfig = searchMenuConfig;
    content.reasoningConfig = reasoningConfig;
    content.onContextChange = onContextChange;
    content.affineFeatureFlagService = framework.get(FeatureFlagService);
    content.affineWorkspaceDialogService = framework.get(
      WorkspaceDialogService
    );
    content.peekViewService = framework.get(PeekViewService);
    content.affineThemeService = framework.get(AppThemeService);
    content.notificationService = notificationService;
    content.aiDraftService = framework.get(AIDraftService);
    content.aiToolsConfigService = framework.get(AIToolsConfigService);
    content.serverService = framework.get(ServerService);
    content.subscriptionService = framework.get(SubscriptionService);
    content.aiModelService = framework.get(AIModelService);
    content.onAISubscribe = handleAISubscribe;

    content.createSession = createSession;
    content.onOpenDoc = onOpenDoc;

    if (!chatContent) {
      // initial values that won't change
      content.independentMode = true;
      content.onboardingOffsetY = -100;
      chatContainerRef.current?.append(content);
      setChatContent(content);
    }
  }, [
    chatContent,
    client,
    createSession,
    currentSession,
    docDisplayConfig,
    framework,
    isBodyProvided,
    mockStd,
    reasoningConfig,
    searchMenuConfig,
    workspaceId,
    confirmModal,
    onContextChange,
    notificationService,
    specs,
    onOpenDoc,
    handleAISubscribe,
  ]);

  // init or update header ai-chat-toolbar
  useEffect(() => {
    if (!isHeaderProvided || !chatToolContainerRef.current) {
      return;
    }
    const tool = getOrCreateAIChatToolbar(chatTool);
    configureAIChatToolbar(tool, {
      session: currentSession,
      workspaceId,
      status,
      docDisplayConfig,
      notificationService,
      onOpenSession,
      onNewSession: () => {
        if (!currentSession) return;
        setCurrentSession(null);
        reMountChatContent();
      },
      onTogglePin: togglePin,
      onOpenDoc: (docId: string, sessionId: string) => {
        const { workbench } = framework.get(WorkbenchService);
        const viewService = framework.get(ViewService);
        workbench.open(`/${docId}?sessionId=${sessionId}`, { at: 'active' });
        workbench.openSidebar();
        viewService.view.activeSidebarTab('chat');
      },
      onSessionDelete: (sessionToDelete: BlockSuitePresets.AIRecentSession) => {
        deleteSession(sessionToDelete).catch(console.error);
      },
    });

    // initial props
    if (!chatTool) {
      // mount
      chatToolContainerRef.current.append(tool);
      setChatTool(tool);
    }
  }, [
    chatTool,
    currentSession,
    docDisplayConfig,
    isHeaderProvided,
    onOpenSession,
    togglePin,
    workspaceId,
    confirmModal,
    framework,
    deleteSession,
    status,
    reMountChatContent,
    notificationService,
  ]);

  useEffect(() => {
    const refNodeSlots = mockStd?.getOptional(RefNodeSlotsProvider);
    if (!refNodeSlots) return;
    const sub = refNodeSlots.docLinkClicked.subscribe(event => {
      const { workbench } = framework.get(WorkbenchService);
      workbench.openDoc({
        docId: event.pageId,
        mode: event.params?.mode,
        blockIds: event.params?.blockIds,
        elementIds: event.params?.elementIds,
        refreshKey: nanoid(),
      });
    });
    return () => sub.unsubscribe();
  }, [framework, mockStd]);

  // restore pinned session
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    client
      .getSessions(
        workspaceId,
        {},
        undefined,
        { pinned: true, limit: 1 },
        signal
      )
      .then(sessions => {
        if (!Array.isArray(sessions)) return;
        const session = sessions[0];
        if (!session) return;
        setCurrentSession(session);
        reMountChatContent();
      })
      .catch(console.error);

    // abort the request
    return () => {
      controller.abort();
    };
  }, [client, reMountChatContent, workspaceId]);

  const onChatContainerRef = useCallback((node: HTMLDivElement) => {
    if (node) {
      setIsBodyProvided(true);
      chatContainerRef.current = node;
      widthSignalRef.current.value = node.clientWidth;
    }
  }, []);

  const onChatToolContainerRef = useCallback((node: HTMLDivElement) => {
    if (node) {
      setIsHeaderProvided(true);
      chatToolContainerRef.current = node;
    }
  }, []);

  // observe chat container width and provide to ai-chat-content
  useEffect(() => {
    if (!isBodyProvided || !chatContainerRef.current) return;
    return observeResize(chatContainerRef.current, entry => {
      widthSignalRef.current.value = entry.contentRect.width;
    });
  }, [isBodyProvided]);

  return (
    <>
      <ViewTitle title={t['com.affine.workspaceSubPath.chat']()} />
      <ViewIcon icon="ai" />
      <ViewHeader>
        <div className={styles.chatHeader}>
          <div />
          <div ref={onChatToolContainerRef} />
        </div>
      </ViewHeader>
      <ViewBody>
        <div className={styles.chatRoot} ref={onChatContainerRef} />
      </ViewBody>
    </>
  );
};
