import { z } from 'zod';

export const StreamObjectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text-delta'),
    textDelta: z.string(),
  }),
  z.object({
    type: z.literal('reasoning'),
    textDelta: z.string(),
  }),
  z.object({
    type: z.literal('tool-call'),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.record(z.any()),
  }),
  z.object({
    type: z.literal('tool-result'),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.record(z.any()),
    result: z.any(),
  }),
]);

export type StreamObject = z.infer<typeof StreamObjectSchema>;

const ChatMessageSchema = z.object({
  id: z.string(),
  content: z.string(),
  role: z.union([z.literal('user'), z.literal('assistant')]),
  createdAt: z.string(),
  streamObjects: z.array(StreamObjectSchema).optional(),
  attachments: z.array(z.string()).optional(),
  userId: z.string().optional(),
  userName: z.string().optional(),
  avatarUrl: z.string().optional(),
});

export const ChatMessagesSchema = z.array(ChatMessageSchema);

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export type ChatAction = {
  action: string;
  messages: ChatMessage[];
  sessionId: string;
  createdAt: string;
};

export type HistoryMessage = ChatMessage | ChatAction;

export type MessageRole = 'user' | 'assistant';

export type MessageUserInfo = {
  userId?: string;
  userName?: string;
  avatarUrl?: string;
};

export function isChatAction(item: HistoryMessage): item is ChatAction {
  return 'action' in item;
}

export function isChatMessage(item: HistoryMessage): item is ChatMessage {
  return 'role' in item;
}

export type ChatStatus =
  | 'loading'
  | 'success'
  | 'error'
  | 'idle'
  | 'transmitting';
