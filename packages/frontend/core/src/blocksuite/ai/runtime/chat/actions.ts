import type { CopilotChatHistoryFragment } from '@affine/graphql';

import type { AIChatContextItem, AIChatScope } from './state';

export type AIChatSendOptions = {
  input?: string;
  contexts?: {
    docs?: unknown;
    files?: unknown;
    selectedSnapshot?: unknown;
    selectedMarkdown?: unknown;
    html?: unknown;
  };
  attachments?: (string | Blob | File)[];
  attachmentPreviews?: string[];
  isRootSession?: boolean;
  where?: BlockSuitePresets.TrackerWhere;
  control?: BlockSuitePresets.TrackerControl;
  reasoning?: boolean;
  toolsConfig?: unknown;
  modelId?: string;
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
  | { type: 'setModel'; modelId?: string }
  | { type: 'addAttachment'; attachment: string | Blob | File }
  | { type: 'removeAttachment'; index: number }
  | { type: 'addContextItem'; item: AIChatContextItem }
  | { type: 'removeContextItem'; item: AIChatContextItem }
  | { type: 'loadContext' }
  | { type: 'pollContext' }
  | { type: 'startContextPolling' }
  | { type: 'stopContextPolling' }
  | { type: 'pollEmbeddingStatus' }
  | ({ type: 'send' } & AIChatSendOptions)
  | { type: 'retry'; messageId: string }
  | { type: 'stop' };
