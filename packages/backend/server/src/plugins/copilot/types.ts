import { type Tokenizer } from '@affine/server-native';
import { AiPromptRole } from '@prisma/client';
import { z } from 'zod';

import { fromModelName } from '../../native';
import type { ChatPrompt } from './prompt';

export enum AvailableModels {
  // text to text
  Gpt4Omni = 'gpt-4o',
  Gpt4Omni0806 = 'gpt-4o-2024-08-06',
  Gpt4OmniMini = 'gpt-4o-mini',
  Gpt4OmniMini0718 = 'gpt-4o-mini-2024-07-18',
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

export const ChatMessageRole = Object.values(AiPromptRole) as [
  'system',
  'assistant',
  'user',
];

const PureMessageSchema = z.object({
  content: z.string(),
  attachments: z.array(z.string()).optional().nullable(),
  params: z.record(z.any()).optional().nullable(),
});

export const PromptMessageSchema = PureMessageSchema.extend({
  role: z.enum(ChatMessageRole),
}).strict();

export type PromptMessage = z.infer<typeof PromptMessageSchema>;

export type PromptParams = NonNullable<PromptMessage['params']>;

export const PromptConfigStrictSchema = z.object({
  // openai
  jsonMode: z.boolean().nullable().optional(),
  frequencyPenalty: z.number().nullable().optional(),
  presencePenalty: z.number().nullable().optional(),
  temperature: z.number().nullable().optional(),
  topP: z.number().nullable().optional(),
  maxTokens: z.number().nullable().optional(),
  // fal
  modelName: z.string().nullable().optional(),
  loras: z
    .array(
      z.object({ path: z.string(), scale: z.number().nullable().optional() })
    )
    .nullable()
    .optional(),
  // google
  audioTimestamp: z.boolean().nullable().optional(),
});

export const PromptConfigSchema =
  PromptConfigStrictSchema.nullable().optional();

export type PromptConfig = z.infer<typeof PromptConfigSchema>;

export const ChatMessageSchema = PromptMessageSchema.extend({
  id: z.string().optional(),
  createdAt: z.date(),
}).strict();

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const SubmittedMessageSchema = PureMessageSchema.extend({
  sessionId: z.string(),
  content: z.string().optional(),
}).strict();

export type SubmittedMessage = z.infer<typeof SubmittedMessageSchema>;

export const ChatHistorySchema = z
  .object({
    sessionId: z.string(),
    action: z.string().nullable(),
    tokens: z.number(),
    messages: z.array(PromptMessageSchema.or(ChatMessageSchema)),
    createdAt: z.date(),
  })
  .strict();

export type ChatHistory = z.infer<typeof ChatHistorySchema>;

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

// ======== Provider Interface ========

export enum CopilotProviderType {
  FAL = 'fal',
  Google = 'google',
  OpenAI = 'openai',
  Perplexity = 'perplexity',
  // only for test
  Test = 'test',
}

export enum CopilotCapability {
  TextToText = 'text-to-text',
  TextToEmbedding = 'text-to-embedding',
  TextToImage = 'text-to-image',
  ImageToImage = 'image-to-image',
  ImageToText = 'image-to-text',
}

const CopilotProviderOptionsSchema = z.object({
  signal: z.instanceof(AbortSignal).optional(),
  user: z.string().optional(),
});

const CopilotChatOptionsSchema = CopilotProviderOptionsSchema.merge(
  PromptConfigStrictSchema
).optional();

export type CopilotChatOptions = z.infer<typeof CopilotChatOptionsSchema>;

const CopilotEmbeddingOptionsSchema = CopilotProviderOptionsSchema.extend({
  dimensions: z.number(),
}).optional();

export type CopilotEmbeddingOptions = z.infer<
  typeof CopilotEmbeddingOptionsSchema
>;

const CopilotImageOptionsSchema = CopilotProviderOptionsSchema.merge(
  PromptConfigStrictSchema
)
  .extend({
    seed: z.number().optional(),
  })
  .optional();

export type CopilotImageOptions = z.infer<typeof CopilotImageOptionsSchema>;

export type CopilotContextFile = {
  id: string; // fileId
  created_at: number;
  // embedding status
  status: 'in_progress' | 'completed' | 'failed';
};

export interface CopilotProvider {
  readonly type: CopilotProviderType;
  getCapabilities(): CopilotCapability[];
  isModelAvailable(model: string): Promise<boolean>;
}

export interface CopilotTextToTextProvider extends CopilotProvider {
  generateText(
    messages: PromptMessage[],
    model?: string,
    options?: CopilotChatOptions
  ): Promise<string>;
  generateTextStream(
    messages: PromptMessage[],
    model?: string,
    options?: CopilotChatOptions
  ): AsyncIterable<string>;
}

export interface CopilotTextToEmbeddingProvider extends CopilotProvider {
  generateEmbedding(
    messages: string[] | string,
    model: string,
    options?: CopilotEmbeddingOptions
  ): Promise<number[][]>;
}

export interface CopilotTextToImageProvider extends CopilotProvider {
  generateImages(
    messages: PromptMessage[],
    model: string,
    options?: CopilotImageOptions
  ): Promise<Array<string>>;
  generateImagesStream(
    messages: PromptMessage[],
    model?: string,
    options?: CopilotImageOptions
  ): AsyncIterable<string>;
}

export interface CopilotImageToTextProvider extends CopilotProvider {
  generateText(
    messages: PromptMessage[],
    model: string,
    options?: CopilotChatOptions
  ): Promise<string>;
  generateTextStream(
    messages: PromptMessage[],
    model: string,
    options?: CopilotChatOptions
  ): AsyncIterable<string>;
}

export interface CopilotImageToImageProvider extends CopilotProvider {
  generateImages(
    messages: PromptMessage[],
    model: string,
    options?: CopilotImageOptions
  ): Promise<Array<string>>;
  generateImagesStream(
    messages: PromptMessage[],
    model?: string,
    options?: CopilotImageOptions
  ): AsyncIterable<string>;
}

export type CapabilityToCopilotProvider = {
  [CopilotCapability.TextToText]: CopilotTextToTextProvider;
  [CopilotCapability.TextToEmbedding]: CopilotTextToEmbeddingProvider;
  [CopilotCapability.TextToImage]: CopilotTextToImageProvider;
  [CopilotCapability.ImageToText]: CopilotImageToTextProvider;
  [CopilotCapability.ImageToImage]: CopilotImageToImageProvider;
};

export type CopilotTextProvider =
  | CopilotTextToTextProvider
  | CopilotImageToTextProvider;
export type CopilotImageProvider =
  | CopilotTextToImageProvider
  | CopilotImageToImageProvider;
export type CopilotAllProvider =
  | CopilotTextProvider
  | CopilotImageProvider
  | CopilotTextToEmbeddingProvider;
