import { observeResize } from '@affine/component';
import { CopilotClient } from '@affine/core/blocksuite/ai';
import { AIChatContent } from '@affine/core/blocksuite/ai/components/ai-chat-content';
import { AIChatToolbar } from '@affine/core/blocksuite/ai/components/ai-chat-toolbar';
import { getCustomPageEditorBlockSpecs } from '@affine/core/blocksuite/ai/components/text-renderer';
import type { PromptKey } from '@affine/core/blocksuite/ai/provider/prompt';
import { useAIChatConfig } from '@affine/core/components/hooks/affine/use-ai-chat-config';
import { getCollection } from '@affine/core/desktop/dialogs/setting/general-setting/editor/edgeless/docs';
import {
  EventSourceService,
  FetchService,
  GraphQLService,
} from '@affine/core/modules/cloud';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import {
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
} from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import type { Doc, Store } from '@blocksuite/affine/store';
import { BlockStdScope, type EditorHost } from '@blocksuite/std';
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
  const t = useI18n();
  const framework = useFramework();
  const [isBodyProvided, setIsBodyProvided] = useState(false);
  const [isHeaderProvided, setIsHeaderProvided] = useState(false);
  const [host, setHost] = useState<EditorHost | null>(null);
  const [chatContent, setChatContent] = useState<AIChatContent | null>(null);
  const [chatTool, setChatTool] = useState<AIChatToolbar | null>(null);
  const [currentSession, setCurrentSession] = useState<CopilotSession | null>(
    null
  );
  const [isTogglingPin, setIsTogglingPin] = useState(false);
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
          sessionId: currentSession.id,
          pinned,
        });
        // retrieve the latest session and update the state
        const session = await client.getSession(workspaceId, currentSession.id);
        setCurrentSession(session);
      }
    } finally {
      setIsTogglingPin(false);
    }
  }, [client, createSession, currentSession, isTogglingPin, workspaceId]);

  // create a temp doc/host for ai-chat-content
  useEffect(() => {
    let tempDoc: Doc | null = null;
    const collection = getCollection();
    const doc = collection.createDoc();
    tempDoc = doc;
    doc.load(() => {
      const host = new BlockStdScope({
        store: tempDoc?.getStore() as Store,
        extensions: getCustomPageEditorBlockSpecs(),
      }).render();
      setHost(host);
    });

    return () => {
      tempDoc?.dispose();
    };
  }, []);

  // init or update ai-chat-content
  useEffect(() => {
    if (!isBodyProvided || !host) {
      return;
    }

    let content = chatContent;

    if (!content) {
      content = new AIChatContent();
    }

    content.session = currentSession;
    content.host = host;
    content.workspaceId = workspaceId;
    content.docDisplayConfig = docDisplayConfig;
    content.searchMenuConfig = searchMenuConfig;
    content.networkSearchConfig = networkSearchConfig;
    content.reasoningConfig = reasoningConfig;
    content.affineFeatureFlagService = framework.get(FeatureFlagService);
    content.affineWorkspaceDialogService = framework.get(
      WorkspaceDialogService
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
    host,
    isBodyProvided,
    networkSearchConfig,
    reasoningConfig,
    searchMenuConfig,
    workspaceId,
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

    tool.onNewSession = () => {
      if (!currentSession) return;
      setCurrentSession(null);
      chatContent?.reset();
    };

    tool.onTogglePin = async () => {
      await togglePin();
    };

    // initial props
    if (!chatTool) {
      // mount
      chatToolContainerRef.current.append(tool);
      setChatTool(tool);
    }
  }, [chatContent, chatTool, currentSession, isHeaderProvided, togglePin]);

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
      <ViewTitle title={t['AFFiNE AI']()} />
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
