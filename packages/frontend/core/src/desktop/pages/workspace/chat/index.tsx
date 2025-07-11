import { observeResize, useConfirmModal } from '@affine/component';
import { CopilotClient } from '@affine/core/blocksuite/ai';
import {
  AIChatContent,
  type ChatContextValue,
} from '@affine/core/blocksuite/ai/components/ai-chat-content';
import type { ChatStatus } from '@affine/core/blocksuite/ai/components/ai-chat-messages';
import { AIChatToolbar } from '@affine/core/blocksuite/ai/components/ai-chat-toolbar';
import type { PromptKey } from '@affine/core/blocksuite/ai/provider/prompt';
import { NotificationServiceImpl } from '@affine/core/blocksuite/view-extensions/editor-view/notification-service';
import { useAIChatConfig } from '@affine/core/components/hooks/affine/use-ai-chat-config';
import { useAISpecs } from '@affine/core/components/hooks/affine/use-ai-specs';
import {
  EventSourceService,
  FetchService,
  GraphQLService,
} from '@affine/core/modules/cloud';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
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
import { type Signal, signal } from '@preact/signals-core';
import { useFramework, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

export const Component = () => {
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

  const workspaceId = useService(WorkspaceService).workspace.id;

  const {
    docDisplayConfig,
    searchMenuConfig,
    networkSearchConfig,
    reasoningConfig,
  } = useAIChatConfig();

  const createSession = useCallback(
    async (options: Partial<BlockSuitePresets.AICreateSessionOptions> = {}) => {
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
    [client, workspaceId]
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

  const onOpenSession = useCallback(
    (sessionId: string) => {
      if (isOpeningSession) return;
      setIsOpeningSession(true);
      client
        .getSession(workspaceId, sessionId)
        .then(session => {
          setCurrentSession(session);
          if (chatContent) {
            chatContent.session = session;
            chatContent.reloadSession();
          }
          chatTool?.closeHistoryMenu();
        })
        .catch(console.error)
        .finally(() => {
          setIsOpeningSession(false);
        });
    },
    [chatContent, chatTool, client, isOpeningSession, workspaceId]
  );

  const onContextChange = useCallback((context: Partial<ChatContextValue>) => {
    setStatus(context.status ?? 'idle');
  }, []);

  const confirmModal = useConfirmModal();
  const specs = useAISpecs();

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
    content.docDisplayConfig = docDisplayConfig;
    content.searchMenuConfig = searchMenuConfig;
    content.networkSearchConfig = networkSearchConfig;
    content.reasoningConfig = reasoningConfig;
    content.onContextChange = onContextChange;
    content.affineFeatureFlagService = framework.get(FeatureFlagService);
    content.affineWorkspaceDialogService = framework.get(
      WorkspaceDialogService
    );
    content.affineThemeService = framework.get(AppThemeService);
    content.notificationService = new NotificationServiceImpl(
      confirmModal.closeConfirmModal,
      confirmModal.openConfirmModal
    );

    if (!chatContent) {
      // initial values that won't change
      content.createSession = createSession;
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
    networkSearchConfig,
    reasoningConfig,
    searchMenuConfig,
    workspaceId,
    confirmModal,
    onContextChange,
    specs,
  ]);

  // init or update header ai-chat-toolbar
  useEffect(() => {
    if (!isHeaderProvided || !chatToolContainerRef.current || !chatContent) {
      return;
    }
    let tool = chatTool;

    if (!tool) {
      tool = new AIChatToolbar();
    }

    tool.session = currentSession;
    tool.workspaceId = workspaceId;
    tool.status = status;
    tool.docDisplayConfig = docDisplayConfig;
    tool.onOpenSession = onOpenSession;
    tool.notificationService = new NotificationServiceImpl(
      confirmModal.closeConfirmModal,
      confirmModal.openConfirmModal
    );

    tool.onNewSession = () => {
      if (!currentSession) return;
      setCurrentSession(null);
      chatContent?.reset();
    };

    tool.onTogglePin = async () => {
      await togglePin();
    };

    tool.onOpenDoc = (docId: string, sessionId: string) => {
      const { workbench } = framework.get(WorkbenchService);
      const viewService = framework.get(ViewService);
      workbench.open(`/${docId}?sessionId=${sessionId}`, { at: 'active' });
      workbench.openSidebar();
      viewService.view.activeSidebarTab('chat');
    };

    // initial props
    if (!chatTool) {
      // mount
      chatToolContainerRef.current.append(tool);
      setChatTool(tool);
    }
  }, [
    chatContent,
    chatTool,
    currentSession,
    docDisplayConfig,
    isHeaderProvided,
    onOpenSession,
    togglePin,
    workspaceId,
    confirmModal,
    framework,
    status,
  ]);

  // restore pinned session
  useEffect(() => {
    if (!chatContent) return;

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
        if (chatContent) {
          chatContent.session = session;
          chatContent.reloadSession();
        }
      })
      .catch(console.error);

    // abort the request
    return () => {
      controller.abort();
    };
  }, [chatContent, client, workspaceId]);

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
      <ViewTitle title="Intelligence" />
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
