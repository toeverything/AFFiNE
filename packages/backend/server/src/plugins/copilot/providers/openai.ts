import { Logger } from '@nestjs/common';
import { APIError, BadRequestError, ClientOptions, OpenAI } from 'openai';

import {
  CopilotPromptInvalid,
  CopilotProviderSideError,
  metrics,
  UserFriendlyError,
} from '../../../fundamentals';
import {
  ChatMessageRole,
  CopilotCapability,
  CopilotChatOptions,
  CopilotEmbeddingOptions,
  CopilotImageOptions,
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
    'gpt-4o',
    'gpt-4o-mini',
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

  private readonly logger = new Logger(OpenAIProvider.type);
  private readonly instance: OpenAI;
  private existsModels: string[] | undefined;

  constructor(config: ClientOptions) {
    this.instance = new OpenAI(config);
  }

  static assetsConfig(config: ClientOptions) {
    return !!config?.apiKey;
  }

  get type(): CopilotProviderType {
    return OpenAIProvider.type;
  }

  getCapabilities(): CopilotCapability[] {
    return OpenAIProvider.capabilities;
  }

  async isModelAvailable(model: string): Promise<boolean> {
    const knownModels = this.availableModels.includes(model);
    if (knownModels) return true;

    if (!this.existsModels) {
      try {
        this.existsModels = await this.instance.models
          .list()
          .then(({ data }) => data.map(m => m.id));
      } catch (e: any) {
        this.logger.error('Failed to fetch online model list', e.stack);
      }
    }
    return !!this.existsModels?.includes(model);
  }

  protected chatToGPTMessage(
    messages: PromptMessage[]
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    // filter redundant fields
    return messages.map(({ role, content, attachments }) => {
      content = content.trim();
      if (Array.isArray(attachments)) {
        const contents: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
          [];
        if (content.length) {
          contents.push({
            type: 'text',
            text: content,
          });
        }
        contents.push(
          ...(attachments
            .filter(url => SIMPLE_IMAGE_URL_REGEX.test(url))
            .map(url => ({
              type: 'image_url',
              image_url: { url, detail: 'high' },
            })) as OpenAI.Chat.Completions.ChatCompletionContentPartImage[])
        );
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
    options = {},
  }: {
    messages?: PromptMessage[];
    embeddings?: string[];
    model: string;
    options: CopilotChatOptions;
  }) {
    if (!this.availableModels.includes(model)) {
      throw new CopilotPromptInvalid(`Invalid model: ${model}`);
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
        throw new CopilotPromptInvalid('Empty message content');
      }
      if (
        messages.some(
          m =>
            typeof m.role !== 'string' ||
            !m.role ||
            !ChatMessageRole.includes(m.role)
        )
      ) {
        throw new CopilotPromptInvalid('Invalid message role');
      }
      // json mode need 'json' keyword in content
      // ref: https://platform.openai.com/docs/api-reference/chat/create#chat-create-response_format
      if (
        options.jsonMode &&
        !messages.some(m => m.content.toLowerCase().includes('json'))
      ) {
        throw new CopilotPromptInvalid('Prompt not support json mode');
      }
    } else if (
      Array.isArray(embeddings) &&
      embeddings.some(e => typeof e !== 'string' || !e || !e.trim())
    ) {
      throw new CopilotPromptInvalid('Invalid embedding');
    }
  }

  private handleError(
    e: any,
    model: string,
    options: CopilotImageOptions = {}
  ) {
    if (e instanceof UserFriendlyError) {
      return e;
    } else if (e instanceof APIError) {
      if (
        e instanceof BadRequestError &&
        (e.message.includes('safety') || e.message.includes('risk'))
      ) {
        metrics.ai
          .counter('chat_text_risk_errors')
          .add(1, { model, user: options.user || undefined });
      }

      return new CopilotProviderSideError({
        provider: this.type,
        kind: e.type || 'unknown',
        message: e.message,
      });
    } else {
      return new CopilotProviderSideError({
        provider: this.type,
        kind: 'unexpected_response',
        message: e?.message || 'Unexpected openai response',
      });
    }
  }

  // ====== text to text ======
  async generateText(
    messages: PromptMessage[],
    model: string = 'gpt-4o-mini',
    options: CopilotChatOptions = {}
  ): Promise<string> {
    this.checkParams({ messages, model, options });

    try {
      metrics.ai.counter('chat_text_calls').add(1, { model });
      const result = await this.instance.chat.completions.create(
        {
          messages: this.chatToGPTMessage(messages),
          model: model,
          temperature: options.temperature || 0,
          max_tokens: options.maxTokens || 4096,
          response_format: {
            type: options.jsonMode ? 'json_object' : 'text',
          },
          user: options.user,
        },
        { signal: options.signal }
      );
      const { content } = result.choices[0].message;
      if (!content) throw new Error('Failed to generate text');
      return content.trim();
    } catch (e: any) {
      metrics.ai.counter('chat_text_errors').add(1, { model });
      throw this.handleError(e, model, options);
    }
  }

  async *generateTextStream(
    messages: PromptMessage[],
    model: string = 'gpt-4o-mini',
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    this.checkParams({ messages, model, options });

    try {
      metrics.ai.counter('chat_text_stream_calls').add(1, { model });
      const result = await this.instance.chat.completions.create(
        {
          stream: true,
          messages: this.chatToGPTMessage(messages),
          model: model,
          frequency_penalty: options.frequencyPenalty || 0,
          presence_penalty: options.presencePenalty || 0,
          temperature: options.temperature || 0.5,
          max_tokens: options.maxTokens || 4096,
          response_format: {
            type: options.jsonMode ? 'json_object' : 'text',
          },
          user: options.user,
        },
        {
          signal: options.signal,
        }
      );

      for await (const message of result) {
        if (!Array.isArray(message.choices) || !message.choices.length) {
          continue;
        }
        const content = message.choices[0].delta.content;
        if (content) {
          yield content;
          if (options.signal?.aborted) {
            result.controller.abort();
            break;
          }
        }
      }
    } catch (e: any) {
      metrics.ai.counter('chat_text_stream_errors').add(1, { model });
      throw this.handleError(e, model, options);
    }
  }

  // ====== text to embedding ======

  async generateEmbedding(
    messages: string | string[],
    model: string,
    options: CopilotEmbeddingOptions = { dimensions: DEFAULT_DIMENSIONS }
  ): Promise<number[][]> {
    messages = Array.isArray(messages) ? messages : [messages];
    this.checkParams({ embeddings: messages, model, options });

    try {
      metrics.ai.counter('generate_embedding_calls').add(1, { model });
      const result = await this.instance.embeddings.create({
        model: model,
        input: messages,
        dimensions: options.dimensions || DEFAULT_DIMENSIONS,
        user: options.user,
      });
      return result.data
        .map(e => e?.embedding)
        .filter(v => v && Array.isArray(v));
    } catch (e: any) {
      metrics.ai.counter('generate_embedding_errors').add(1, { model });
      throw this.handleError(e, model, options);
    }
  }

  // ====== text to image ======
  async generateImages(
    messages: PromptMessage[],
    model: string = 'dall-e-3',
    options: CopilotImageOptions = {}
  ): Promise<Array<string>> {
    const { content: prompt } = messages.pop() || {};
    if (!prompt) throw new CopilotPromptInvalid('Prompt is required');

    try {
      metrics.ai.counter('generate_images_calls').add(1, { model });
      const result = await this.instance.images.generate(
        {
          prompt,
          model,
          response_format: 'url',
          user: options.user,
        },
        { signal: options.signal }
      );

      return result.data
        .map(image => image.url)
        .filter((v): v is string => !!v);
    } catch (e: any) {
      metrics.ai.counter('generate_images_errors').add(1, { model });
      throw this.handleError(e, model, options);
    }
  }

  async *generateImagesStream(
    messages: PromptMessage[],
    model: string = 'dall-e-3',
    options: CopilotImageOptions = {}
  ): AsyncIterable<string> {
    try {
      metrics.ai.counter('generate_images_stream_calls').add(1, { model });
      const ret = await this.generateImages(messages, model, options);
      for (const url of ret) {
        yield url;
      }
    } catch (e) {
      metrics.ai.counter('generate_images_stream_errors').add(1, { model });
      throw e;
    }
  }
}
