import type { AIError } from '@blocksuite/blocks';
import { type ChatMessage } from '@blocksuite/presets';

export type ChatStatus = 'success' | 'error' | 'idle' | 'transmitting';

export type ChatContextValue = {
  messages: ChatMessage[];
  status: ChatStatus;
  error: AIError | null;
  markdown: string;
  images: File[];
  abortController: AbortController | null;
  sessionId: string | null;
};
