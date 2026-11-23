import type { Signal } from '@preact/signals-core';

import type { AIError } from '../../provider';
import type { ChatContextValue } from '../ai-chat-content';
import type { ChatStatus, HistoryMessage } from '../ai-chat-messages';

export interface AIReasoningConfig {
  enabled: Signal<boolean | undefined>;
  setEnabled: (state: boolean) => void;
}

export interface AIPlaygroundConfig {
  visible: Signal<boolean | undefined>;
}

// TODO: remove this type
export type AIChatInputContext = {
  messages: HistoryMessage[];
  status: ChatStatus;
  error: AIError | null;
  quote?: string;
  markdown?: string;
  images: File[];
  abortController: AbortController | null;
} & Pick<
  ChatContextValue,
  'snapshot' | 'combinedElementsMarkdown' | 'attachments' | 'docs' | 'html'
>;
