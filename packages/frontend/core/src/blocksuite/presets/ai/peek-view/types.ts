import type { AIError } from '@blocksuite/blocks';
import { type ChatMessage } from '@blocksuite/presets';

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
