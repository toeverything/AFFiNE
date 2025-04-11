import { AiPromptRole } from '@prisma/client';
import { z } from 'zod';

import { type CopilotProvider } from './provider';

export enum CopilotProviderType {
  FAL = 'fal',
  Gemini = 'gemini',
  OpenAI = 'openai',
  Perplexity = 'perplexity',
}

export enum CopilotCapability {
  TextToText = 'text-to-text',
  TextToEmbedding = 'text-to-embedding',
  TextToImage = 'text-to-image',
  ImageToImage = 'image-to-image',
  ImageToText = 'image-to-text',
}

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

export const ChatMessageRole = Object.values(AiPromptRole) as [
  'system',
  'assistant',
  'user',
];

export const PureMessageSchema = z.object({
  content: z.string(),
  attachments: z.array(z.string()).optional().nullable(),
  params: z.record(z.any()).optional().nullable(),
});

export const PromptMessageSchema = PureMessageSchema.extend({
  role: z.enum(ChatMessageRole),
}).strict();
export type PromptMessage = z.infer<typeof PromptMessageSchema>;
export type PromptParams = NonNullable<PromptMessage['params']>;

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
