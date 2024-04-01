import { AiPromptRole } from '@prisma/client';
import type { ClientOptions as OpenAIClientOptions } from 'openai';
import {
  encoding_for_model,
  get_encoding,
  Tiktoken,
  TiktokenModel,
} from 'tiktoken';
import { z } from 'zod';

import { ChatPrompt } from './prompt';

export interface CopilotConfig {
  openai: OpenAIClientOptions;
  fal: {
    secret: string;
  };
}

export enum AvailableModels {
  // text to text
  Gpt4VisionPreview = 'gpt-4-vision-preview',
  Gpt4TurboPreview = 'gpt-4-turbo-preview',
  Gpt35Turbo = 'gpt-3.5-turbo',
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

export function getTokenEncoder(model?: string | null): Tiktoken | undefined {
  if (!model) return undefined;
  const modelStr = AvailableModels[model as AvailableModel];
  if (!modelStr) return undefined;
  if (modelStr.startsWith('gpt')) {
    return encoding_for_model(modelStr as TiktokenModel);
  } else if (modelStr.startsWith('dall')) {
    // dalle don't need to calc the token
    return undefined;
  } else {
    return get_encoding('cl100k_base');
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
  attachments: z.array(z.string()).optional(),
  params: z
    .record(z.union([z.string(), z.array(z.string())]))
    .optional()
    .nullable(),
});

export const PromptMessageSchema = PureMessageSchema.extend({
  role: z.enum(ChatMessageRole),
}).strict();

export type PromptMessage = z.infer<typeof PromptMessageSchema>;

export type PromptParams = NonNullable<PromptMessage['params']>;

export const ChatMessageSchema = PromptMessageSchema.extend({
  createdAt: z.date(),
}).strict();

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const SubmittedMessageSchema = PureMessageSchema.extend({
  sessionId: z.string(),
}).strict();

export type SubmittedMessage = z.infer<typeof SubmittedMessageSchema>;

export const ChatHistorySchema = z
  .object({
    sessionId: z.string(),
    action: z.string().optional(),
    tokens: z.number(),
    messages: z.array(PromptMessageSchema.or(ChatMessageSchema)),
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

export interface ChatSessionState
  extends Omit<ChatSessionOptions, 'promptName'> {
  // connect ids
  sessionId: string;
  // states
  prompt: ChatPrompt;
  messages: ChatMessage[];
}

export type ListHistoriesOptions = {
  action: boolean | undefined;
  limit: number | undefined;
  skip: number | undefined;
  sessionId: string | undefined;
};

// ======== Provider Interface ========

export enum CopilotProviderType {
  FAL = 'fal',
  OpenAI = 'openai',
}

export enum CopilotCapability {
  TextToText = 'text-to-text',
  TextToEmbedding = 'text-to-embedding',
  TextToImage = 'text-to-image',
  ImageToImage = 'image-to-image',
}

export interface CopilotProvider {
  getCapabilities(): CopilotCapability[];
}

export interface CopilotTextToTextProvider extends CopilotProvider {
  generateText(
    messages: PromptMessage[],
    model?: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
      user?: string;
    }
  ): Promise<string>;
  generateTextStream(
    messages: PromptMessage[],
    model?: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
      user?: string;
    }
  ): AsyncIterable<string>;
}

export interface CopilotTextToEmbeddingProvider extends CopilotProvider {
  generateEmbedding(
    messages: string[] | string,
    model: string,
    options: {
      dimensions: number;
      signal?: AbortSignal;
      user?: string;
    }
  ): Promise<number[][]>;
}

export interface CopilotTextToImageProvider extends CopilotProvider {
  generateImages(
    messages: PromptMessage[],
    model: string,
    options: {
      signal?: AbortSignal;
      user?: string;
    }
  ): Promise<Array<string>>;
  generateImagesStream(
    messages: PromptMessage[],
    model?: string,
    options?: {
      signal?: AbortSignal;
      user?: string;
    }
  ): AsyncIterable<string>;
}

export interface CopilotImageToImageProvider extends CopilotProvider {}

export type CapabilityToCopilotProvider = {
  [CopilotCapability.TextToText]: CopilotTextToTextProvider;
  [CopilotCapability.TextToEmbedding]: CopilotTextToEmbeddingProvider;
  [CopilotCapability.TextToImage]: CopilotTextToImageProvider;
  [CopilotCapability.ImageToImage]: CopilotImageToImageProvider;
};
