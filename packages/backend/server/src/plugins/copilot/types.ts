import { type Tokenizer } from '@affine/server-native';
import { z } from 'zod';

import { OneMB } from '../../base';
import { fromModelName } from '../../native';
import type { ChatPrompt } from './prompt';
import { PromptMessageSchema, PureMessageSchema } from './providers';

export enum AvailableModels {
  // text to text
  Gpt4Omni = 'gpt-4o',
  Gpt4Omni0806 = 'gpt-4o-2024-08-06',
  Gpt4OmniMini = 'gpt-4o-mini',
  Gpt4OmniMini0718 = 'gpt-4o-mini-2024-07-18',
  Gpt41 = 'gpt-4.1',
  Gpt410414 = 'gpt-4.1-2025-04-14',
  Gpt41Mini = 'gpt-4.1-mini',
  // embeddings
  TextEmbedding3Large = 'text-embedding-3-large',
  TextEmbedding3Small = 'text-embedding-3-small',
  TextEmbeddingAda002 = 'text-embedding-ada-002',
  // moderation
  TextModerationLatest = 'text-moderation-latest',
  TextModerationStable = 'text-moderation-stable',
  // text to image
  DallE3 = 'dall-e-3',
}

export type AvailableModel = keyof typeof AvailableModels;

export function getTokenEncoder(model?: string | null): Tokenizer | null {
  if (!model) return null;
  const modelStr = AvailableModels[model as AvailableModel];
  if (!modelStr) return null;
  if (modelStr.startsWith('gpt')) {
    return fromModelName(modelStr);
  } else if (modelStr.startsWith('dall')) {
    // dalle don't need to calc the token
    return null;
  } else {
    // c100k based model
    return fromModelName('gpt-4');
  }
}

// ======== ChatMessage ========

export const ChatMessageSchema = PromptMessageSchema.extend({
  id: z.string().optional(),
  createdAt: z.date(),
}).strict();
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatHistorySchema = z
  .object({
    sessionId: z.string(),
    action: z.string().nullable(),
    tokens: z.number(),
    messages: z.array(ChatMessageSchema),
    createdAt: z.date(),
  })
  .strict();

export type ChatHistory = z.infer<typeof ChatHistorySchema>;

export const SubmittedMessageSchema = PureMessageSchema.extend({
  sessionId: z.string(),
  content: z.string().optional(),
}).strict();
export type SubmittedMessage = z.infer<typeof SubmittedMessageSchema>;

// ======== Chat Session ========

export interface ChatSessionOptions {
  // connect ids
  userId: string;
  workspaceId: string;
  docId: string;
  promptName: string;
}

export interface ChatSessionPromptUpdateOptions
  extends Pick<ChatSessionState, 'sessionId' | 'userId'> {
  promptName: string;
}

export interface ChatSessionForkOptions
  extends Omit<ChatSessionOptions, 'promptName'> {
  sessionId: string;
  latestMessageId: string;
}

export interface ChatSessionState
  extends Omit<ChatSessionOptions, 'promptName'> {
  // connect ids
  sessionId: string;
  parentSessionId: string | null;
  // states
  prompt: ChatPrompt;
  messages: ChatMessage[];
}

export type ListHistoriesOptions = {
  action: boolean | undefined;
  fork: boolean | undefined;
  limit: number | undefined;
  skip: number | undefined;
  sessionOrder: 'asc' | 'desc' | undefined;
  messageOrder: 'asc' | 'desc' | undefined;
  sessionId: string | undefined;
  withPrompt: boolean | undefined;
};

export type CopilotContextFile = {
  id: string; // fileId
  created_at: number;
  // embedding status
  status: 'in_progress' | 'completed' | 'failed';
};

export const MAX_EMBEDDABLE_SIZE = 50 * OneMB;
