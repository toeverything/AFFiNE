import type { CopilotChatHistoryFragment } from '@affine/graphql';
import type { NotificationService } from '@blocksuite/affine/shared/services';

import type { AIChatRuntime, AIChatSnapshot } from '../../runtime/chat';
import type { DocDisplayConfig } from '../ai-chat-chips';
import { AIChatToolbar } from './ai-chat-toolbar';

export type ConfigureAIChatToolbarOptions = {
  session: CopilotChatHistoryFragment | null | undefined;
  runtime: AIChatRuntime;
  runtimeSnapshot: AIChatSnapshot;
  docId?: string;
  docDisplayConfig: DocDisplayConfig;
  notificationService: NotificationService;
  onOpenDoc: (docId: string, sessionId: string) => void;
  onSessionDelete: (session: BlockSuitePresets.AIRecentSession) => void;
};

export function getOrCreateAIChatToolbar(
  current: AIChatToolbar | null | undefined
): AIChatToolbar {
  return current ?? new AIChatToolbar();
}

export function configureAIChatToolbar(
  tool: AIChatToolbar,
  options: ConfigureAIChatToolbarOptions
): AIChatToolbar {
  tool.session = options.session;
  tool.runtime = options.runtime;
  tool.runtimeSnapshot = options.runtimeSnapshot;
  tool.docId = options.docId;
  tool.docDisplayConfig = options.docDisplayConfig;
  tool.notificationService = options.notificationService;
  tool.onOpenDoc = options.onOpenDoc;
  tool.onSessionDelete = options.onSessionDelete;
  return tool;
}
