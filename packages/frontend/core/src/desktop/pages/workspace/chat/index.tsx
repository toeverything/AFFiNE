import { observeResize } from '@affine/component';
import { CopilotClient } from '@affine/core/blocksuite/ai';
import { AIChatContent } from '@affine/core/blocksuite/ai/components/ai-chat-content';
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
  const [doc, setDoc] = useState<Doc | null>(null);
  const [host, setHost] = useState<EditorHost | null>(null);
  const [chatContent, setChatContent] = useState<AIChatContent | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const widthSignalRef = useRef<Signal<number>>(signal(0));
  const client = useCopilotClient();

  const workspaceId = useService(WorkspaceService).workspace.id;

  const {
    docDisplayConfig,
    searchMenuConfig,
    networkSearchConfig,
    reasoningConfig,
  } = useAIChatConfig();

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
      setDoc(doc);
      setHost(host);
    });

    return () => {
      tempDoc?.dispose();
    };
  }, []);

  // init or update ai-chat-content
  useEffect(() => {
    if (!isBodyProvided || !host || !doc) {
      return;
    }

    let content = chatContent;

    if (!content) {
      content = new AIChatContent();
    }
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
      const createSession = async () => {
        const sessionId = await client.createSession({
          workspaceId,
          docId: doc.id,
          promptName: 'Chat With AFFiNE AI' satisfies PromptKey,
        });

        const session = await client.getSession(workspaceId, sessionId);
        return session;
      };

      content.createSession = createSession;
      content.independentMode = true;
      content.onboardingOffsetY = -100;
      chatContainerRef.current?.append(content);
      setChatContent(content);
    }
  }, [
    chatContent,
    client,
    doc,
    docDisplayConfig,
    framework,
    host,
    isBodyProvided,
    networkSearchConfig,
    reasoningConfig,
    searchMenuConfig,
    workspaceId,
  ]);

  const onChatContainerRef = useCallback((node: HTMLDivElement) => {
    if (node) {
      setIsBodyProvided(true);
      chatContainerRef.current = node;
      widthSignalRef.current.value = node.clientWidth;
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
      <ViewHeader></ViewHeader>
      <ViewBody>
        <div className={styles.chatRoot} ref={onChatContainerRef} />
      </ViewBody>
    </>
  );
};
