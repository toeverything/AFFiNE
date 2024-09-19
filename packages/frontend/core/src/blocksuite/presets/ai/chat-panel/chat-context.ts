import type { AIError } from '@blocksuite/affine/blocks';

export type ChatMessage = {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  attachments?: string[];
  createdAt: string;
};

export type ChatAction = {
  action: string;
  messages: ChatMessage[];
  sessionId: string;
  createdAt: string;
};

export type ChatItem = ChatMessage | ChatAction;

export type ChatStatus =
  | 'loading'
  | 'success'
  | 'error'
  | 'idle'
  | 'transmitting';

export type ChatContextValue = {
  items: ChatItem[];
  status: ChatStatus;
  error: AIError | null;
  quote: string;
  markdown: string;
  images: File[];
  abortController: AbortController | null;
  chatSessionId: string | null;
};

export type ChatBlockMessage = ChatMessage & {
  userId?: string;
  userName?: string;
  avatarUrl?: string;
};
