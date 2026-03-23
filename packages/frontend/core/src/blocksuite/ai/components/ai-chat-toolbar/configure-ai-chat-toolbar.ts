import type { CopilotChatHistoryFragment } from '@affine/graphql';
import type { NotificationService } from '@blocksuite/affine/shared/services';

import type { DocDisplayConfig } from '../ai-chat-chips';
import type { ChatStatus } from '../ai-chat-messages';
import { AIChatToolbar } from './ai-chat-toolbar';

export type ConfigureAIChatToolbarOptions = {
  session: CopilotChatHistoryFragment | null | undefined;
  workspaceId: string;
  docId?: string;
  status: ChatStatus;
  docDisplayConfig: DocDisplayConfig;
  notificationService: NotificationService;
  onNewSession: () => void;
  onTogglePin: () => Promise<void>;
  onOpenSession: (sessionId: string) => void;
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
  tool.workspaceId = options.workspaceId;
  tool.docId = options.docId;
  tool.status = options.status;
  tool.docDisplayConfig = options.docDisplayConfig;
  tool.notificationService = options.notificationService;
  tool.onNewSession = options.onNewSession;
  tool.onTogglePin = options.onTogglePin;
  tool.onOpenSession = options.onOpenSession;
  tool.onOpenDoc = options.onOpenDoc;
  tool.onSessionDelete = options.onSessionDelete;
  return tool;
}
