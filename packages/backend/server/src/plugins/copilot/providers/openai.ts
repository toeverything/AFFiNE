import assert from 'node:assert';

import { ClientOptions, OpenAI } from 'openai';

import {
  ChatMessage,
  CopilotCapability,
  CopilotProviderType,
  CopilotTextToEmbeddingProvider,
  CopilotTextToTextProvider,
} from '../types';

export class OpenAIProvider
  extends OpenAI
  implements CopilotTextToTextProvider, CopilotTextToEmbeddingProvider
{
  static readonly type = CopilotProviderType.OpenAI;
  static readonly capabilities = [
    CopilotCapability.TextToText,
    CopilotCapability.TextToEmbedding,
    CopilotCapability.TextToImage,
  ];

  readonly availableModels = ['gpt-3.5-turbo'];

  constructor(config: ClientOptions) {
    assert(OpenAIProvider.assetsConfig(config));
    super(config);
  }

  static assetsConfig(config: ClientOptions) {
    return !!config.apiKey;
  }

  getCapabilities(): CopilotCapability[] {
    return OpenAIProvider.capabilities;
  }

  private chatToGPTMessage(messages: ChatMessage[]) {
    // filter redundant fields
    return messages.map(message => ({
      role: message.role,
      content: message.content,
    }));
  }

  // ====== text to text ======

  async generateText(
    messages: ChatMessage[],
    model: string = 'gpt-3.5-turbo',
    options: {
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
      user?: string;
    } = {}
  ): Promise<string> {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Invalid model: ${model}`);
    }
    const result = await this.chat.completions.create(
      {
        messages: this.chatToGPTMessage(messages),
        model: model,
        temperature: options.temperature || 0,
        max_tokens: options.maxTokens || 4096,
        user: options.user,
      },
      { signal: options.signal }
    );
    const { content } = result.choices[0].message;
    if (!content) {
      throw new Error('Failed to generate text');
    }
    return content;
  }

  async *generateTextStream(
    messages: ChatMessage[],
    model: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
      user?: string;
    } = {}
  ): AsyncIterable<string> {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Invalid model: ${model}`);
    }
    const result = await this.chat.completions.create(
      {
        stream: true,
        messages: this.chatToGPTMessage(messages),
        model: model,
        temperature: options.temperature || 0,
        max_tokens: options.maxTokens || 4096,
        user: options.user,
      },
      {
        signal: options.signal,
      }
    );

    for await (const message of result) {
      const content = message.choices[0].delta.content;
      if (content) {
        yield content;
        if (options.signal?.aborted) {
          result.controller.abort();
          break;
        }
      }
    }
  }

  // ====== text to embedding ======

  async generateEmbedding(
    messages: string | string[],
    model: string,
    options: {
      dimensions: number;
      signal?: AbortSignal;
      user?: string;
    } = { dimensions: 256 }
  ): Promise<number[][]> {
    messages = Array.isArray(messages) ? messages : [messages];
    const result = await this.embeddings.create({
      model: model,
      input: messages,
      dimensions: options.dimensions,
      user: options.user,
    });
    return result.data.map(e => e.embedding);
  }
}
