import { type Tokenizer } from '@affine/server-native';
import { z } from 'zod';

import { OneMB } from '../../base';
import { fromModelName } from '../../native';
import type { ChatPrompt } from './prompt';
import { PromptMessageSchema, PureMessageSchema } from './providers';

const takeFirst = (v: unknown) => (Array.isArray(v) ? v[0] : v);

const zBool = z.preprocess(val => {
  const s = String(takeFirst(val)).toLowerCase();
  return ['true', '1', 'yes'].includes(s);
}, z.boolean().default(false));

const zMaybeString = z.preprocess(val => {
  const s = takeFirst(val);
  return s === '' || s == null ? undefined : s;
}, z.string().min(1).optional());

export const ChatQuerySchema = z
  .object({
    messageId: zMaybeString,
    modelId: zMaybeString,
    retry: zBool,
    reasoning: zBool,
    webSearch: zBool,
  })
  .catchall(z.string())
  .transform(
    ({ messageId, modelId, retry, reasoning, webSearch, ...params }) => ({
      messageId,
      modelId,
      retry,
      reasoning,
      webSearch,
      params,
    })
  );

export enum AvailableModels {
  // text to text
  Gpt4Omni = 'gpt-4o',
  Gpt4Omni0806 = 'gpt-4o-2024-08-06',
  Gpt4OmniMini = 'gpt-4o-mini',
  Gpt4OmniMini0718 = 'gpt-4o-mini-2024-07-18',
  Gpt41 = 'gpt-4.1',
  Gpt410414 = 'gpt-4.1-2025-04-14',
  Gpt41Mini = 'gpt-4.1-mini',
  Gpt41Nano = 'gpt-4.1-nano',
  // embeddings
  TextEmbedding3Large = 'text-embedding-3-large',
  TextEmbedding3Small = 'text-embedding-3-small',
  TextEmbeddingAda002 = 'text-embedding-ada-002',
  // text to image
  DallE3 = 'dall-e-3',
  GptImage = 'gpt-image-1',
}

const availableModels = Object.values(AvailableModels);

export function getTokenEncoder(model?: string | null): Tokenizer | null {
  if (!model) return null;
  if (!availableModels.includes(model as AvailableModels)) return null;
  if (model.startsWith('gpt')) {
    return fromModelName(model);
  } else if (model.startsWith('dall')) {
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
    pinned: z.boolean(),
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
  docId: string | null;
  promptName: string;
  pinned: boolean;
}

export interface ChatSessionForkOptions
  extends Omit<ChatSessionOptions, 'pinned' | 'promptName'> {
  sessionId: string;
  latestMessageId?: string;
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

export type CopilotContextFile = {
  id: string; // fileId
  created_at: number;
  // embedding status
  status: 'in_progress' | 'completed' | 'failed';
};

export const MAX_EMBEDDABLE_SIZE = 50 * OneMB;
