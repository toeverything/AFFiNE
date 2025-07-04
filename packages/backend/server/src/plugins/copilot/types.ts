import { z } from 'zod';

import { OneMB } from '../../base';
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

// ======== ChatMessage ========

export const ChatMessageSchema = PromptMessageSchema.extend({
  id: z.string().optional(),
  createdAt: z.date(),
}).strict();
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatHistorySchema = z
  .object({
    userId: z.string(),
    sessionId: z.string(),
    workspaceId: z.string(),
    docId: z.string().nullable(),
    parentSessionId: z.string().nullable(),
    pinned: z.boolean(),
    title: z.string().nullable(),

    action: z.string().nullable(),
    model: z.string(),
    optionalModels: z.array(z.string()),
    promptName: z.string(),

    tokens: z.number(),
    messages: z.array(ChatMessageSchema),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

export type ChatHistory = z.infer<typeof ChatHistorySchema>;

export const SubmittedMessageSchema = PureMessageSchema.extend({
  sessionId: z.string(),
  content: z.string().optional(),
}).strict();
export type SubmittedMessage = z.infer<typeof SubmittedMessageSchema>;

// ======== Chat Session ========

export type ChatSessionOptions = Pick<
  ChatHistory,
  'userId' | 'workspaceId' | 'docId' | 'promptName' | 'pinned'
> & {
  reuseLatestChat?: boolean;
};

export type ChatSessionForkOptions = Pick<
  ChatHistory,
  'userId' | 'sessionId' | 'workspaceId' | 'docId'
> & {
  latestMessageId?: string;
};

export type ChatSessionState = Pick<
  ChatHistory,
  'userId' | 'sessionId' | 'workspaceId' | 'docId' | 'messages'
> & {
  prompt: ChatPrompt;
};

export type CopilotContextFile = {
  id: string; // fileId
  created_at: number;
  // embedding status
  status: 'in_progress' | 'completed' | 'failed';
};

export const MAX_EMBEDDABLE_SIZE = 50 * OneMB;
