import assert from 'node:assert';

import { ClientOptions, OpenAI } from 'openai';

import {
  ChatMessageRole,
  CopilotCapability,
  CopilotProviderType,
  CopilotTextToEmbeddingProvider,
  CopilotTextToTextProvider,
  PromptMessage,
} from '../types';

const DEFAULT_DIMENSIONS = 256;

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

  readonly availableModels = [
    // text to text
    'gpt-4-vision-preview',
    'gpt-4-turbo-preview',
    'gpt-3.5-turbo',
    // embeddings
    'text-embedding-3-large',
    'text-embedding-3-small',
    'text-embedding-ada-002',
    // moderation
    'text-moderation-latest',
    'text-moderation-stable',
  ];

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

  private chatToGPTMessage(messages: PromptMessage[]) {
    // filter redundant fields
    return messages.map(message => ({
      role: message.role,
      content: message.content,
    }));
  }

  private checkParams({
    messages,
    embeddings,
    model,
  }: {
    messages?: PromptMessage[];
    embeddings?: string[];
    model: string;
  }) {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Invalid model: ${model}`);
    }
    if (Array.isArray(messages) && messages.length > 0) {
      if (
        messages.some(
          m =>
            // check non-object
            typeof m !== 'object' ||
            !m ||
            // check content
            typeof m.content !== 'string' ||
            !m.content ||
            !m.content.trim()
        )
      ) {
        throw new Error('Empty message content');
      }
      if (
        messages.some(
          m =>
            typeof m.role !== 'string' ||
            !m.role ||
            !ChatMessageRole.includes(m.role)
        )
      ) {
        throw new Error('Invalid message role');
      }
    } else if (
      Array.isArray(embeddings) &&
      embeddings.some(e => typeof e !== 'string' || !e || !e.trim())
    ) {
      throw new Error('Invalid embedding');
    }
  }

  // ====== text to text ======

  async generateText(
    messages: PromptMessage[],
    model: string = 'gpt-3.5-turbo',
    options: {
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
      user?: string;
    } = {}
  ): Promise<string> {
    this.checkParams({ messages, model });
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
    messages: PromptMessage[],
    model: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
      user?: string;
    } = {}
  ): AsyncIterable<string> {
    this.checkParams({ messages, model });
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
    } = { dimensions: DEFAULT_DIMENSIONS }
  ): Promise<number[][]> {
    messages = Array.isArray(messages) ? messages : [messages];
    this.checkParams({ embeddings: messages, model });

    const result = await this.embeddings.create({
      model: model,
      input: messages,
      dimensions: options.dimensions || DEFAULT_DIMENSIONS,
      user: options.user,
    });
    return result.data.map(e => e.embedding);
  }
}
