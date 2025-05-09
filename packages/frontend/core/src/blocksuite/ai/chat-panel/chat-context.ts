import type {
  ChatStatus,
  HistoryMessage,
} from '../components/ai-chat-messages';
import type { AIError } from '../provider';

export type ChatContextValue = {
  // history messages of the chat
  messages: HistoryMessage[];
  status: ChatStatus;
  error: AIError | null;
  // plain-text of the selected content
  quote: string;
  // markdown of the selected content
  markdown: string;
  // images of the selected content or user uploaded
  images: File[];
  abortController: AbortController | null;
};
