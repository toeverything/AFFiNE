import type { ChatMessage, ChatStatus } from '../components/ai-chat-messages';
import type { AIError } from '../provider';

export type ChatContext = {
  messages: ChatMessage[];
  status: ChatStatus;
  error: AIError | null;
  images: File[];
  abortController: AbortController | null;
};
