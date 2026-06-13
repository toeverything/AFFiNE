import { z } from 'zod';

import { ChatMessageAttachment } from '../providers/types';
import {
  StreamObjectSchema,
  type ToolEvent,
  ToolEventSchema,
} from '../runtime/contracts/runtime-event-contract';

const CanonicalDateSchema = z.coerce.date();

export const ConversationSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    workspaceId: z.string(),
    docId: z.string().nullable(),
    pinned: z.boolean(),
    parentId: z.string().nullable(),
    title: z.string().nullable(),
    createdAt: CanonicalDateSchema,
    updatedAt: CanonicalDateSchema,
  })
  .strict();

export type Conversation = z.infer<typeof ConversationSchema>;

export const TurnSchema = z
  .object({
    id: z.string().optional(),
    conversationId: z.string(),
    role: z.enum(['system', 'assistant', 'user']),
    content: z.string(),
    attachments: z.array(ChatMessageAttachment).default([]),
    renderTrace: z.array(StreamObjectSchema).default([]),
    toolEvents: z.array(ToolEventSchema).default([]),
    metadata: z.record(z.string(), z.any()).default({}),
    createdAt: CanonicalDateSchema,
  })
  .strict();

export type Turn = z.infer<typeof TurnSchema>;

export const ValidatedStructuredValueSchema = z
  .object({
    value: z.any(),
    schemaHash: z.string(),
    schemaValidationVersion: z.string(),
    provider: z.string(),
    model: z.string(),
  })
  .strict();

export type ValidatedStructuredValue = z.infer<
  typeof ValidatedStructuredValueSchema
>;

export type { ToolEvent };
