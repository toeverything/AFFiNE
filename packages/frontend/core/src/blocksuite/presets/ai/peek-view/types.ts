import type { AIError } from '@blocksuite/affine/blocks';
import type { ChatMessage } from '@toeverything/infra/blocksuite';

export type ChatStatus =
  | 'success'
  | 'error'
  | 'idle'
  | 'transmitting'
  | 'loading';

export type ChatContext = {
  messages: ChatMessage[];
  status: ChatStatus;
  error: AIError | null;
  images: File[];
  abortController: AbortController | null;
  currentSessionId: string | null;
  currentChatBlockId: string | null;
};
