import type { AIError } from '../../provider';
import type { ChatStatus, HistoryMessage } from '../ai-chat-messages';

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
  // snapshot of the selected content
  snapshot: string | null;
  // attachments of the selected content
  attachments: { sourceId: string; name: string }[];
  // combined markdown of the selected elements
  combinedElementsMarkdown: string | null;
  // docs of the selected content
  docs: string[];
  // html of make it real
  html: string | null;
  abortController: AbortController | null;
};
