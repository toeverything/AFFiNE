import type { CopilotChatHistoryFragment } from '@affine/graphql';

import type { AIChatScope, AIChatScopeSelector } from './state';

export type AIChatSendOptions = {
  input?: string;
  contexts?: {
    docs?: unknown;
    files?: unknown;
  };
  attachments?: (string | Blob | File)[];
  attachmentPreviews?: string[];
  isRootSession?: boolean;
  where?: BlockSuitePresets.TrackerWhere;
  control?: BlockSuitePresets.TrackerControl;
  reasoning?: boolean;
  toolsConfig?: unknown;
  routeTargetId?: string;
  userInfo?: {
    userId?: string;
    userName?: string;
    avatarUrl?: string;
  };
};

export type AIChatAction =
  | { type: 'initialize'; scope?: AIChatScope }
  | { type: 'setScope'; scope: AIChatScope }
  | { type: 'refreshHistory' }
  | {
      type: 'openSession';
      sessionId: string;
    }
  | {
      type: 'openSessionObject';
      session: CopilotChatHistoryFragment;
    }
  | { type: 'closeTab'; tabId: string }
  | { type: 'createNewSession'; pinned?: boolean }
  | { type: 'togglePinActiveSession' }
  | { type: 'deleteSession'; sessionId: string }
  | { type: 'clearError' }
  | { type: 'setComposerText'; text: string }
  | { type: 'setReasoning'; reasoning: boolean }
  | { type: 'setRouteTarget'; routeTargetId?: string }
  | { type: 'addAttachment'; attachment: string | Blob | File }
  | { type: 'removeAttachment'; index: number }
  | { type: 'addScopeSelector'; item: AIChatScopeSelector }
  | { type: 'removeScopeSelector'; item: AIChatScopeSelector }
  | { type: 'addFocusSelector'; item: AIChatScopeSelector }
  | { type: 'removeFocusSelector'; item: AIChatScopeSelector }
  | ({ type: 'send' } & AIChatSendOptions)
  | { type: 'retry'; messageId: string }
  | { type: 'stop' };
