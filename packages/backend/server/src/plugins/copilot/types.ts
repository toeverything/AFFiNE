import type { ClientOptions as OpenAIClientOptions } from 'openai';
import { z } from 'zod';

export interface CopilotConfig {
  openai: OpenAIClientOptions;
  fal: {
    secret: string;
  };
}

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

export const ChatMessageRole = ['system', 'assistant', 'user'] as const;

export const ChatMessageSchema = z
  .object({
    role: z.enum(ChatMessageRole),
    content: z.string(),
  })
  .strict();

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export interface CopilotTextToTextProvider extends CopilotProvider {
  generateText(messages: ChatMessage[], model: string): Promise<string>;
  generateTextStream(
    messages: ChatMessage[],
    model: string
  ): AsyncIterable<string>;
}

export interface CopilotTextToEmbeddingProvider extends CopilotProvider {}

export interface CopilotTextToImageProvider extends CopilotProvider {}

export interface CopilotImageToImageProvider extends CopilotProvider {}

export type CapabilityToCopilotProvider = {
  [CopilotCapability.TextToText]: CopilotTextToTextProvider;
  [CopilotCapability.TextToEmbedding]: CopilotTextToEmbeddingProvider;
  [CopilotCapability.TextToImage]: CopilotTextToImageProvider;
  [CopilotCapability.ImageToImage]: CopilotImageToImageProvider;
};
