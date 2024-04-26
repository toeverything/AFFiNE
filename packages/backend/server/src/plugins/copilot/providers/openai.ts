import assert from 'node:assert';

import { ClientOptions, OpenAI } from 'openai';

import {
  ChatMessageRole,
  CopilotCapability,
  CopilotImageToTextProvider,
  CopilotProviderType,
  CopilotTextToEmbeddingProvider,
  CopilotTextToImageProvider,
  CopilotTextToTextProvider,
  PromptMessage,
} from '../types';

export const DEFAULT_DIMENSIONS = 256;

const SIMPLE_IMAGE_URL_REGEX = /^(https?:\/\/|data:image\/)/;

export class OpenAIProvider
  implements
    CopilotTextToTextProvider,
    CopilotTextToEmbeddingProvider,
    CopilotTextToImageProvider,
    CopilotImageToTextProvider
{
  static readonly type = CopilotProviderType.OpenAI;
  static readonly capabilities = [
    CopilotCapability.TextToText,
    CopilotCapability.TextToEmbedding,
    CopilotCapability.TextToImage,
    CopilotCapability.ImageToText,
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
    // text to image
    'dall-e-3',
  ];

  private readonly instance: OpenAI;

  constructor(config: ClientOptions) {
    assert(OpenAIProvider.assetsConfig(config));
    this.instance = new OpenAI(config);
  }

  static assetsConfig(config: ClientOptions) {
    return !!config.apiKey;
  }

  get type(): CopilotProviderType {
    return OpenAIProvider.type;
  }

  getCapabilities(): CopilotCapability[] {
    return OpenAIProvider.capabilities;
  }

  isModelAvailable(model: string): boolean {
    return this.availableModels.includes(model);
  }

  protected chatToGPTMessage(
    messages: PromptMessage[]
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    // filter redundant fields
    return messages.map(({ role, content, attachments }) => {
      if (Array.isArray(attachments)) {
        const contents = [
          { type: 'text', text: content },
          ...attachments
            .filter(url => SIMPLE_IMAGE_URL_REGEX.test(url))
            .map(url => ({
              type: 'image_url',
              image_url: { url, detail: 'high' },
            })),
        ];
        return {
          role,
          content: contents,
        } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
      } else {
        return { role, content };
      }
    });
  }

  protected checkParams({
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
            // content and attachments must exist at least one
            ((!m.content || !m.content.trim()) &&
              (!Array.isArray(m.attachments) || !m.attachments.length))
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
    const result = await this.instance.chat.completions.create(
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
    model: string = 'gpt-3.5-turbo',
    options: {
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
      user?: string;
    } = {}
  ): AsyncIterable<string> {
    this.checkParams({ messages, model });
    const result = await this.instance.chat.completions.create(
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

    const result = await this.instance.embeddings.create({
      model: model,
      input: messages,
      dimensions: options.dimensions || DEFAULT_DIMENSIONS,
      user: options.user,
    });
    return result.data.map(e => e.embedding);
  }

  // ====== text to image ======
  async generateImages(
    messages: PromptMessage[],
    model: string = 'dall-e-3',
    options: {
      signal?: AbortSignal;
      user?: string;
    } = {}
  ): Promise<Array<string>> {
    const { content: prompt } = messages.pop() || {};
    if (!prompt) {
      throw new Error('Prompt is required');
    }
    const result = await this.instance.images.generate(
      {
        prompt,
        model,
        response_format: 'url',
        user: options.user,
      },
      { signal: options.signal }
    );

    return result.data.map(image => image.url).filter((v): v is string => !!v);
  }

  async *generateImagesStream(
    messages: PromptMessage[],
    model: string = 'dall-e-3',
    options: {
      signal?: AbortSignal;
      user?: string;
    } = {}
  ): AsyncIterable<string> {
    const ret = await this.generateImages(messages, model, options);
    for (const url of ret) {
      yield url;
    }
  }
}
