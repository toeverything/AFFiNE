import type { Tool, ToolSet } from 'ai';
import { z } from 'zod';

import {
  CopilotPromptInvalid,
  CopilotProviderSideError,
  metrics,
  OneMB,
  readResponseBufferWithLimit,
  safeFetch,
  UserFriendlyError,
} from '../../../base';
import {
  llmDispatchStream,
  type NativeLlmBackendConfig,
  type NativeLlmRequest,
} from '../../../native';
import type { NodeTextMiddleware } from '../config';
import { buildNativeRequest, NativeProviderAdapter } from './native';
import { CopilotProvider } from './provider';
import type {
  CopilotChatOptions,
  CopilotChatTools,
  CopilotEmbeddingOptions,
  CopilotImageOptions,
  CopilotStructuredOptions,
  ModelConditions,
  PromptMessage,
  StreamObject,
} from './types';
import { CopilotProviderType, ModelInputType, ModelOutputType } from './types';
import { chatToGPTMessage } from './utils';

export const DEFAULT_DIMENSIONS = 256;

export type OpenAIConfig = {
  apiKey: string;
  baseURL?: string;
  oldApiStyle?: boolean;
};

const ModelListSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
});

const ImageResponseSchema = z.union([
  z.object({
    data: z.array(
      z.object({
        b64_json: z.string().optional(),
        url: z.string().optional(),
      })
    ),
  }),
  z.object({
    error: z.object({
      message: z.string(),
      type: z.string().nullish(),
      param: z.any().nullish(),
      code: z.union([z.string(), z.number()]).nullish(),
    }),
  }),
]);
const LogProbsSchema = z.array(
  z.object({
    token: z.string(),
    logprob: z.number(),
    top_logprobs: z.array(
      z.object({
        token: z.string(),
        logprob: z.number(),
      })
    ),
  })
);

const TRUSTED_ATTACHMENT_HOST_SUFFIXES = ['cdn.affine.pro'];

function normalizeImageFormatToMime(format?: string) {
  switch (format?.toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

function normalizeImageResponseData(
  data: { b64_json?: string; url?: string }[],
  mimeType: string = 'image/png'
) {
  return data
    .map(image => {
      if (image.b64_json) {
        return `data:${mimeType};base64,${image.b64_json}`;
      }
      return image.url;
    })
    .filter((value): value is string => typeof value === 'string');
}

export class OpenAIProvider extends CopilotProvider<OpenAIConfig> {
  readonly type = CopilotProviderType.OpenAI;

  readonly models = [
    // Text to Text models
    {
      name: 'GPT 4o',
      id: 'gpt-4o',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
        },
      ],
    },
    // FIXME(@darkskygit): deprecated
    {
      name: 'GPT 4o 2024-08-06',
      id: 'gpt-4o-2024-08-06',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
        },
      ],
    },
    {
      name: 'GPT 4o Mini',
      id: 'gpt-4o-mini',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
        },
      ],
    },
    // FIXME(@darkskygit): deprecated
    {
      name: 'GPT 4o Mini 2024-07-18',
      id: 'gpt-4o-mini-2024-07-18',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
        },
      ],
    },
    {
      name: 'GPT 4.1',
      id: 'gpt-4.1',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
          defaultForOutputType: true,
        },
      ],
    },
    {
      name: 'GPT 4.1 2025-04-14',
      id: 'gpt-4.1-2025-04-14',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
        },
      ],
    },
    {
      name: 'GPT 4.1 Mini',
      id: 'gpt-4.1-mini',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
        },
      ],
    },
    {
      name: 'GPT 4.1 Nano',
      id: 'gpt-4.1-nano',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
        },
      ],
    },
    {
      name: 'GPT 5',
      id: 'gpt-5',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
        },
      ],
    },
    {
      name: 'GPT 5 2025-08-07',
      id: 'gpt-5-2025-08-07',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
        },
      ],
    },
    {
      name: 'GPT 5 Mini',
      id: 'gpt-5-mini',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
        },
      ],
    },
    {
      name: 'GPT 5 Nano',
      id: 'gpt-5-nano',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
        },
      ],
    },
    {
      name: 'GPT O1',
      id: 'o1',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
        },
      ],
    },
    {
      name: 'GPT O3',
      id: 'o3',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
        },
      ],
    },
    {
      name: 'GPT O4 Mini',
      id: 'o4-mini',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
        },
      ],
    },
    // Embedding models
    {
      id: 'text-embedding-3-large',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Embedding],
          defaultForOutputType: true,
        },
      ],
    },
    {
      id: 'text-embedding-3-small',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Embedding],
        },
      ],
    },
    // Image generation models
    {
      id: 'dall-e-3',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Image],
        },
      ],
    },
    {
      id: 'gpt-image-1',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Image],
          defaultForOutputType: true,
        },
      ],
    },
  ];

  override configured(): boolean {
    return !!this.config.apiKey;
  }

  protected override setup() {
    super.setup();
  }

  private handleError(e: any) {
    if (e instanceof UserFriendlyError) {
      return e;
    }
    return new CopilotProviderSideError({
      provider: this.type,
      kind: 'unexpected_response',
      message: e?.message || 'Unexpected openai response',
    });
  }

  override async refreshOnlineModels() {
    try {
      const baseUrl = this.config.baseURL || 'https://api.openai.com/v1';
      if (this.config.apiKey && baseUrl && !this.onlineModelList.length) {
        const { data } = await fetch(`${baseUrl}/models`, {
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
        })
          .then(r => r.json())
          .then(r => ModelListSchema.parse(r));
        this.onlineModelList = data.map(model => model.id);
      }
    } catch (e) {
      this.logger.error('Failed to fetch available models', e);
    }
  }

  override getProviderSpecificTools(
    toolName: CopilotChatTools,
    _model: string
  ): [string, Tool?] | undefined {
    if (toolName === 'docEdit') {
      return ['doc_edit', undefined];
    }
    return;
  }

  private createNativeConfig(): NativeLlmBackendConfig {
    const baseUrl = this.config.baseURL || 'https://api.openai.com/v1';
    return {
      base_url: baseUrl.replace(/\/v1\/?$/, ''),
      auth_token: this.config.apiKey,
    };
  }

  private createNativeAdapter(
    tools: ToolSet,
    nodeTextMiddleware?: NodeTextMiddleware[]
  ) {
    return new NativeProviderAdapter(
      (request: NativeLlmRequest, signal?: AbortSignal) =>
        llmDispatchStream(
          this.config.oldApiStyle ? 'openai_chat' : 'openai_responses',
          this.createNativeConfig(),
          request,
          signal
        ),
      tools,
      this.MAX_STEPS,
      { nodeTextMiddleware }
    );
  }

  private getReasoning(
    options: NonNullable<CopilotChatOptions>,
    model: string
  ): Record<string, unknown> | undefined {
    if (options.reasoning && this.isReasoningModel(model)) {
      return { effort: 'medium' };
    }
    return undefined;
  }

  async text(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): Promise<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Text };
    await this.checkParams({ messages, cond: fullCond, options });
    const model = this.selectModel(fullCond);

    try {
      metrics.ai.counter('chat_text_calls').add(1, this.metricLabels(model.id));
      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const { request } = await buildNativeRequest({
        model: model.id,
        messages,
        options,
        tools,
        include: options.webSearch ? ['citations'] : undefined,
        reasoning: this.getReasoning(options, model.id),
        middleware,
      });
      const adapter = this.createNativeAdapter(tools, middleware.node?.text);
      return await adapter.text(request, options.signal);
    } catch (e: any) {
      metrics.ai
        .counter('chat_text_errors')
        .add(1, this.metricLabels(model.id));
      throw this.handleError(e);
    }
  }

  async *streamText(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    const fullCond = {
      ...cond,
      outputType: ModelOutputType.Text,
    };
    await this.checkParams({ messages, cond: fullCond, options });
    const model = this.selectModel(fullCond);

    try {
      metrics.ai
        .counter('chat_text_stream_calls')
        .add(1, this.metricLabels(model.id));
      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const { request } = await buildNativeRequest({
        model: model.id,
        messages,
        options,
        tools,
        include: options.webSearch ? ['citations'] : undefined,
        reasoning: this.getReasoning(options, model.id),
        middleware,
      });
      const adapter = this.createNativeAdapter(tools, middleware.node?.text);
      for await (const chunk of adapter.streamText(request, options.signal)) {
        yield chunk;
      }
    } catch (e: any) {
      metrics.ai
        .counter('chat_text_stream_errors')
        .add(1, this.metricLabels(model.id));
      throw this.handleError(e);
    }
  }

  override async *streamObject(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): AsyncIterable<StreamObject> {
    const fullCond = { ...cond, outputType: ModelOutputType.Object };
    await this.checkParams({ cond: fullCond, messages, options });
    const model = this.selectModel(fullCond);

    try {
      metrics.ai
        .counter('chat_object_stream_calls')
        .add(1, this.metricLabels(model.id));
      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const { request } = await buildNativeRequest({
        model: model.id,
        messages,
        options,
        tools,
        include: options.webSearch ? ['citations'] : undefined,
        reasoning: this.getReasoning(options, model.id),
        middleware,
      });
      const adapter = this.createNativeAdapter(tools, middleware.node?.text);
      for await (const chunk of adapter.streamObject(request, options.signal)) {
        yield chunk;
      }
    } catch (e: any) {
      metrics.ai
        .counter('chat_object_stream_errors')
        .add(1, this.metricLabels(model.id));
      throw this.handleError(e);
    }
  }

  override async structure(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotStructuredOptions = {}
  ): Promise<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Structured };
    await this.checkParams({ messages, cond: fullCond, options });
    const model = this.selectModel(fullCond);

    try {
      metrics.ai.counter('chat_text_calls').add(1, { model: model.id });
      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const { request, schema } = await buildNativeRequest({
        model: model.id,
        messages,
        options,
        tools,
        reasoning: this.getReasoning(options, model.id),
        middleware,
      });
      if (!schema) {
        throw new CopilotPromptInvalid('Schema is required');
      }
      const adapter = this.createNativeAdapter(tools, middleware.node?.text);
      const text = await adapter.text(request, options.signal);
      const parsed = JSON.parse(text);
      const validated = schema.parse(parsed);
      return JSON.stringify(validated);
    } catch (e: any) {
      metrics.ai.counter('chat_text_errors').add(1, { model: model.id });
      throw this.handleError(e);
    }
  }

  override async rerank(
    cond: ModelConditions,
    chunkMessages: PromptMessage[][],
    options: CopilotChatOptions = {}
  ): Promise<number[]> {
    const fullCond = { ...cond, outputType: ModelOutputType.Text };
    await this.checkParams({ messages: [], cond: fullCond, options });
    const model = this.selectModel(fullCond);

    const scores = await Promise.all(
      chunkMessages.map(async messages => {
        const [system, msgs] = await chatToGPTMessage(messages);
        const response = await this.requestOpenAIJson(
          '/chat/completions',
          {
            model: model.id,
            messages: this.toOpenAIChatMessages(system, msgs),
            temperature: 0,
            max_tokens: 16,
            logprobs: true,
            top_logprobs: 16,
          },
          options.signal
        );

        const logprobs = response?.choices?.[0]?.logprobs?.content;
        if (!Array.isArray(logprobs) || logprobs.length === 0) {
          return 0;
        }

        const parsedLogprobs = LogProbsSchema.parse(logprobs);
        const topMap = parsedLogprobs[0].top_logprobs.reduce(
          (acc, { token, logprob }) => ({ ...acc, [token]: logprob }),
          {} as Record<string, number>
        );

        const findLogProb = (token: string): number => {
          // OpenAI often includes a leading space, so try matching '.yes', '_yes', ' yes' and 'yes'
          return [...'_:. "-\t,(=_“'.split('').map(c => c + token), token]
            .flatMap(v => [v, v.toLowerCase(), v.toUpperCase()])
            .reduce<number>(
              (best, key) =>
                (topMap[key] ?? Number.NEGATIVE_INFINITY) > best
                  ? topMap[key]
                  : best,
              Number.NEGATIVE_INFINITY
            );
        };

        const logYes = findLogProb('Yes');
        const logNo = findLogProb('No');

        const pYes = Math.exp(logYes);
        const pNo = Math.exp(logNo);
        const prob = pYes + pNo === 0 ? 0 : pYes / (pYes + pNo);

        return prob;
      })
    );

    return scores;
  }

  // ====== text to image ======
  private buildImageFetchOptions(url: URL) {
    const baseOptions = { timeoutMs: 15_000, maxRedirects: 3 } as const;
    const trustedOrigins = new Set<string>();
    const protocol = this.AFFiNEConfig.server.https ? 'https:' : 'http:';
    const port = this.AFFiNEConfig.server.port;
    const isDefaultPort =
      (protocol === 'https:' && port === 443) ||
      (protocol === 'http:' && port === 80);

    const addHostOrigin = (host: string) => {
      if (!host) return;
      try {
        const parsed = new URL(`${protocol}//${host}`);
        if (!parsed.port && !isDefaultPort) {
          parsed.port = String(port);
        }
        trustedOrigins.add(parsed.origin);
      } catch {
        // ignore invalid host config entries
      }
    };

    if (this.AFFiNEConfig.server.externalUrl) {
      try {
        trustedOrigins.add(
          new URL(this.AFFiNEConfig.server.externalUrl).origin
        );
      } catch {
        // ignore invalid external URL
      }
    }

    addHostOrigin(this.AFFiNEConfig.server.host);
    for (const host of this.AFFiNEConfig.server.hosts) {
      addHostOrigin(host);
    }

    const hostname = url.hostname.toLowerCase();
    const trustedByHost = TRUSTED_ATTACHMENT_HOST_SUFFIXES.some(
      suffix => hostname === suffix || hostname.endsWith(`.${suffix}`)
    );
    if (trustedOrigins.has(url.origin) || trustedByHost) {
      return { ...baseOptions, allowPrivateOrigins: new Set([url.origin]) };
    }

    return baseOptions;
  }

  private redactUrl(raw: string | URL): string {
    try {
      const parsed = raw instanceof URL ? raw : new URL(raw);
      if (parsed.protocol === 'data:') return 'data:[redacted]';
      const segments = parsed.pathname.split('/').filter(Boolean);
      const redactedPath =
        segments.length <= 2
          ? parsed.pathname || '/'
          : `/${segments[0]}/${segments[1]}/...`;
      return `${parsed.origin}${redactedPath}`;
    } catch {
      return '[invalid-url]';
    }
  }

  private async fetchImage(
    url: string,
    maxBytes: number,
    signal?: AbortSignal
  ): Promise<{ buffer: Buffer; type: string } | null> {
    if (url.startsWith('data:')) {
      let response: Response;
      try {
        response = await fetch(url, { signal });
      } catch (error) {
        this.logger.warn(
          `Skip image attachment data URL due to read failure: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return null;
      }

      if (!response.ok) {
        this.logger.warn(
          `Skip image attachment data URL due to invalid response: ${response.status}`
        );
        return null;
      }

      const type =
        response.headers.get('content-type') || 'application/octet-stream';
      if (!type.startsWith('image/')) {
        await response.body?.cancel().catch(() => undefined);
        this.logger.warn(
          `Skip non-image attachment data URL with content-type ${type}`
        );
        return null;
      }

      try {
        const buffer = await readResponseBufferWithLimit(response, maxBytes);
        return { buffer, type };
      } catch (error) {
        this.logger.warn(
          `Skip image attachment data URL due to read failure/size limit: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return null;
      }
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      this.logger.warn(
        `Skip image attachment with invalid URL: ${this.redactUrl(url)}`
      );
      return null;
    }
    const redactedUrl = this.redactUrl(parsed);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      this.logger.warn(
        `Skip image attachment with unsupported protocol: ${redactedUrl}`
      );
      return null;
    }

    let response: Response;
    try {
      response = await safeFetch(
        parsed,
        { method: 'GET', signal },
        this.buildImageFetchOptions(parsed)
      );
    } catch (error) {
      this.logger.warn(
        `Skip image attachment due to blocked/unreachable URL: ${redactedUrl}, reason: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }

    if (!response.ok) {
      this.logger.warn(
        `Skip image attachment fetch failure ${response.status}: ${redactedUrl}`
      );
      return null;
    }

    const type =
      response.headers.get('content-type') || 'application/octet-stream';
    if (!type.startsWith('image/')) {
      await response.body?.cancel().catch(() => undefined);
      this.logger.warn(
        `Skip non-image attachment with content-type ${type}: ${redactedUrl}`
      );
      return null;
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      this.logger.warn(
        `Skip oversized image attachment by content-length (${contentLength}): ${redactedUrl}`
      );
      return null;
    }

    try {
      const buffer = await readResponseBufferWithLimit(response, maxBytes);
      return { buffer, type };
    } catch (error) {
      this.logger.warn(
        `Skip image attachment due to read failure/size limit: ${redactedUrl}, reason: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  private async *generateImageWithAttachments(
    model: string,
    prompt: string,
    attachments: NonNullable<PromptMessage['attachments']>,
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const form = new FormData();
    const outputFormat = 'webp';
    const maxBytes = 10 * OneMB;
    form.set('model', model);
    form.set('prompt', prompt);
    form.set('output_format', outputFormat);

    for (const [idx, entry] of attachments.entries()) {
      const url = typeof entry === 'string' ? entry : entry.attachment;
      try {
        const attachment = await this.fetchImage(url, maxBytes, signal);
        if (!attachment) continue;
        const { buffer, type } = attachment;
        const extension = type.split(';')[0].split('/')[1] || 'png';
        const file = new File([buffer], `${idx}.${extension}`, { type });
        form.append('image[]', file);
      } catch {
        continue;
      }
    }

    if (!form.getAll('image[]').length) {
      throw new CopilotPromptInvalid(
        'No valid image attachments found. Please attach images.'
      );
    }

    const url = `${this.config.baseURL || 'https://api.openai.com/v1'}/images/edits`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: form,
    });

    if (!res.ok) {
      throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
    }

    const json = await res.json();
    const imageResponse = ImageResponseSchema.safeParse(json);
    if (!imageResponse.success) {
      throw new Error(imageResponse.error.message);
    }
    const data = imageResponse.data;
    if ('error' in data) {
      throw new Error(data.error.message);
    }

    const images = normalizeImageResponseData(
      data.data,
      normalizeImageFormatToMime(outputFormat)
    );
    if (!images.length) {
      throw new Error('No images returned from OpenAI');
    }
    for (const image of images) {
      yield image;
    }
  }

  override async *streamImages(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotImageOptions = {}
  ) {
    const fullCond = { ...cond, outputType: ModelOutputType.Image };
    await this.checkParams({ messages, cond: fullCond, options });
    const model = this.selectModel(fullCond);

    metrics.ai
      .counter('generate_images_stream_calls')
      .add(1, { model: model.id });

    const { content: prompt, attachments } = [...messages].pop() || {};
    if (!prompt) throw new CopilotPromptInvalid('Prompt is required');

    try {
      if (attachments && attachments.length > 0) {
        yield* this.generateImageWithAttachments(
          model.id,
          prompt,
          attachments,
          options.signal
        );
      } else {
        const response = await this.requestOpenAIJson('/images/generations', {
          model: model.id,
          prompt,
          ...(options.quality ? { quality: options.quality } : {}),
        });
        const imageResponse = ImageResponseSchema.parse(response);
        if ('error' in imageResponse) {
          throw new Error(imageResponse.error.message);
        }

        const imageUrls = normalizeImageResponseData(imageResponse.data);
        if (!imageUrls.length) {
          throw new Error('No images returned from OpenAI');
        }

        for (const imageUrl of imageUrls) {
          yield imageUrl;
          if (options.signal?.aborted) {
            break;
          }
        }
      }
      return;
    } catch (e: any) {
      metrics.ai.counter('generate_images_errors').add(1, { model: model.id });
      throw this.handleError(e);
    }
  }

  override async embedding(
    cond: ModelConditions,
    messages: string | string[],
    options: CopilotEmbeddingOptions = { dimensions: DEFAULT_DIMENSIONS }
  ): Promise<number[][]> {
    messages = Array.isArray(messages) ? messages : [messages];
    const fullCond = { ...cond, outputType: ModelOutputType.Embedding };
    await this.checkParams({ embeddings: messages, cond: fullCond, options });
    const model = this.selectModel(fullCond);

    try {
      metrics.ai
        .counter('generate_embedding_calls')
        .add(1, { model: model.id });
      const response = await this.requestOpenAIJson('/embeddings', {
        model: model.id,
        input: messages,
        dimensions: options.dimensions || DEFAULT_DIMENSIONS,
      });
      const data = Array.isArray(response?.data) ? response.data : [];
      return data
        .map((item: any) => item?.embedding)
        .filter((embedding: unknown) => Array.isArray(embedding)) as number[][];
    } catch (e: any) {
      metrics.ai
        .counter('generate_embedding_errors')
        .add(1, { model: model.id });
      throw this.handleError(e);
    }
  }

  private toOpenAIChatMessages(
    system: string | undefined,
    messages: Awaited<ReturnType<typeof chatToGPTMessage>>[1]
  ) {
    const result: Array<{ role: string; content: string }> = [];
    if (system) {
      result.push({ role: 'system', content: system });
    }

    for (const message of messages) {
      if (typeof message.content === 'string') {
        result.push({ role: message.role, content: message.content });
        continue;
      }

      const text = message.content
        .filter(
          part =>
            part &&
            typeof part === 'object' &&
            'type' in part &&
            part.type === 'text' &&
            'text' in part
        )
        .map(part => String((part as { text: string }).text))
        .join('\n');

      result.push({ role: message.role, content: text || '[no content]' });
    }

    return result;
  }

  private async requestOpenAIJson(
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<any> {
    const baseUrl = this.config.baseURL || 'https://api.openai.com/v1';
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI API error ${response.status}: ${await response.text()}`
      );
    }

    return await response.json();
  }

  private isReasoningModel(model: string) {
    // o series reasoning models
    return model.startsWith('o') || model.startsWith('gpt-5');
  }
}
