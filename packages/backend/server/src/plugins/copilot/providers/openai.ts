import {
  createOpenAI,
  openai,
  type OpenAIProvider as VercelOpenAIProvider,
  OpenAIResponsesProviderOptions,
} from '@ai-sdk/openai';
import {
  AISDKError,
  embedMany,
  experimental_generateImage as generateImage,
  generateObject,
  generateText,
  streamText,
} from 'ai';

import {
  CopilotPromptInvalid,
  CopilotProviderSideError,
  metrics,
  UserFriendlyError,
} from '../../../base';
import { createExaSearchTool } from '../tools';
import { CopilotProvider } from './provider';
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
} from './types';
import { chatToGPTMessage, CitationParser } from './utils';

export const DEFAULT_DIMENSIONS = 256;

export type OpenAIConfig = {
  apiKey: string;
  baseUrl?: string;
};

type OpenAITools = {
  web_search_preview: ReturnType<typeof openai.tools.webSearchPreview>;
  web_search_exa: ReturnType<typeof createExaSearchTool>;
};

export class OpenAIProvider
  extends CopilotProvider<OpenAIConfig>
  implements
    CopilotTextToTextProvider,
    CopilotTextToEmbeddingProvider,
    CopilotTextToImageProvider,
    CopilotImageToTextProvider
{
  readonly type = CopilotProviderType.OpenAI;
  readonly capabilities = [
    CopilotCapability.TextToText,
    CopilotCapability.TextToEmbedding,
    CopilotCapability.TextToImage,
    CopilotCapability.ImageToText,
  ];

  readonly models = [
    // text to text
    'gpt-4o',
    'gpt-4o-2024-08-06',
    'gpt-4o-mini',
    'gpt-4o-mini-2024-07-18',
    'gpt-4.1',
    'gpt-4.1-2025-04-14',
    'gpt-4.1-mini',
    'o1',
    'o4-mini',
    // embeddings
    'text-embedding-3-large',
    'text-embedding-3-small',
    'text-embedding-ada-002',
    // moderation
    'text-moderation-latest',
    'text-moderation-stable',
    // text to image
    'dall-e-3',
    'gpt-image-1',
  ];

  private readonly MAX_STEPS = 20;

  private readonly CALLOUT_PREFIX = '\n> [!]\n> ';

  #instance!: VercelOpenAIProvider;

  override configured(): boolean {
    return !!this.config.apiKey;
  }

  protected override setup() {
    super.setup();
    this.#instance = createOpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
    });
  }

  protected async checkParams({
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
    if (!(await this.isModelAvailable(model))) {
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
    } else if (e instanceof AISDKError) {
      if (e.message.includes('safety') || e.message.includes('risk')) {
        metrics.ai
          .counter('chat_text_risk_errors')
          .add(1, { model, user: options.user || undefined });
      }

      return new CopilotProviderSideError({
        provider: this.type,
        kind: e.name || 'unknown',
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

  private getTools(
    options: CopilotChatOptions,
    model: string
  ): Partial<OpenAITools> {
    const tools: Partial<OpenAITools> = {};
    if (options?.tools?.length) {
      for (const tool of options.tools) {
        switch (tool) {
          case 'webSearch': {
            // o series reasoning models
            if (model.startsWith('o')) {
              tools.web_search_exa = createExaSearchTool(this.AFFiNEConfig);
            } else {
              tools.web_search_preview = openai.tools.webSearchPreview();
            }
            break;
          }
        }
      }
      return tools;
    }
    return tools;
  }

  // ====== text to text ======
  async generateText(
    messages: PromptMessage[],
    model: string = 'gpt-4.1-mini',
    options: CopilotChatOptions = {}
  ): Promise<string> {
    await this.checkParams({ messages, model, options });

    try {
      metrics.ai.counter('chat_text_calls').add(1, { model });

      const [system, msgs, schema] = await chatToGPTMessage(messages);

      const modelInstance = this.#instance(model, {
        structuredOutputs: Boolean(options.jsonMode),
        user: options.user,
      });

      const commonParams = {
        model: modelInstance,
        system,
        messages: msgs,
        temperature: options.temperature || 0,
        maxTokens: options.maxTokens || 4096,
        abortSignal: options.signal,
      };

      const { text } = schema
        ? await generateObject({
            ...commonParams,
            schema,
          }).then(r => ({ text: JSON.stringify(r.object) }))
        : await generateText({
            ...commonParams,
            providerOptions: {
              openai: this.getOpenAIOptions(options),
            },
            tools: this.getTools(options, model),
            maxSteps: this.MAX_STEPS,
          });

      return text.trim();
    } catch (e: any) {
      metrics.ai.counter('chat_text_errors').add(1, { model });
      throw this.handleError(e, model, options);
    }
  }

  async *generateTextStream(
    messages: PromptMessage[],
    model: string = 'gpt-4.1-mini',
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    await this.checkParams({ messages, model, options });

    try {
      metrics.ai.counter('chat_text_stream_calls').add(1, { model });

      const [system, msgs] = await chatToGPTMessage(messages);

      const modelInstance = this.#instance.responses(model);

      const tools = this.getTools(options, model);
      const { fullStream } = streamText({
        model: modelInstance,
        system,
        messages: msgs,
        providerOptions: {
          openai: this.getOpenAIOptions(options),
        },
        tools: tools as OpenAITools,
        maxSteps: this.MAX_STEPS,
        frequencyPenalty: options.frequencyPenalty || 0,
        presencePenalty: options.presencePenalty || 0,
        temperature: options.temperature || 0,
        maxTokens: options.maxTokens || 4096,
        abortSignal: options.signal,
      });

      const parser = new CitationParser();
      let lastType;
      // reasoning, tool-call, tool-result need to mark as callout
      let prefix: string | null = this.CALLOUT_PREFIX;
      for await (const chunk of fullStream) {
        if (chunk) {
          switch (chunk.type) {
            case 'text-delta': {
              let result = parser.parse(chunk.textDelta);
              if (lastType !== chunk.type) {
                result = '\n\n' + result;
              }
              yield result;
              break;
            }
            case 'reasoning': {
              if (prefix) {
                yield prefix;
                prefix = null;
              }
              let result = chunk.textDelta;
              if (lastType !== chunk.type) {
                result = '\n\n' + result;
              }
              yield this.markAsCallout(result);
              break;
            }
            case 'tool-call': {
              if (prefix) {
                yield prefix;
                prefix = null;
              }
              if (chunk.toolName === 'web_search_exa') {
                yield this.markAsCallout(
                  `\nSearching the web "${chunk.args.query}"\n`
                );
              }
              break;
            }
            case 'tool-result': {
              if (chunk.toolName === 'web_search_exa') {
                yield this.markAsCallout(
                  `\n${this.getWebSearchLinks(chunk.result)}\n`
                );
              }
              break;
            }
            case 'finish': {
              const result = parser.end();
              yield result;
              break;
            }
            case 'error': {
              const error = chunk.error as { type: string; message: string };
              throw new Error(error.message);
            }
          }

          if (options.signal?.aborted) {
            await fullStream.cancel();
            break;
          }
          lastType = chunk.type;
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
    await this.checkParams({ embeddings: messages, model, options });

    try {
      metrics.ai.counter('generate_embedding_calls').add(1, { model });

      const modelInstance = this.#instance.embedding(model, {
        dimensions: options.dimensions || DEFAULT_DIMENSIONS,
        user: options.user,
      });

      const { embeddings } = await embedMany({
        model: modelInstance,
        values: messages,
      });

      return embeddings.filter(v => v && Array.isArray(v));
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

      const modelInstance = this.#instance.image(model);

      const result = await generateImage({
        model: modelInstance,
        prompt,
        providerOptions: {
          openai: {
            quality: options.quality || null,
          },
        },
      });

      return result.images.map(
        image => `data:image/png;base64,${image.base64}`
      );
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

  private getOpenAIOptions(options: CopilotChatOptions) {
    const result: OpenAIResponsesProviderOptions = {};
    if (options?.reasoning) {
      result.reasoningEffort = 'medium';
      result.reasoningSummary = 'detailed';
    }
    if (options?.user) {
      result.user = options.user;
    }
    return result;
  }

  private getWebSearchLinks(
    list: {
      title: string | null;
      url: string;
    }[]
  ): string {
    const links = list.reduce((acc, result) => {
      return acc + `\n[${result.title ?? result.url}](${result.url})\n\n`;
    }, '');
    return links;
  }

  private markAsCallout(text: string) {
    return text.replaceAll('\n', '\n> ');
  }
}
