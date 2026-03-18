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
  llmEmbeddingDispatch,
  llmRerankDispatch,
  llmStructuredDispatch,
  type NativeLlmBackendConfig,
  type NativeLlmEmbeddingRequest,
  type NativeLlmRequest,
  type NativeLlmRerankRequest,
  type NativeLlmRerankResponse,
  type NativeLlmStructuredRequest,
} from '../../../native';
import type { NodeTextMiddleware } from '../config';
import type { CopilotTool, CopilotToolSet } from '../tools';
import { IMAGE_ATTACHMENT_CAPABILITY } from './attachments';
import {
  buildNativeEmbeddingRequest,
  buildNativeRequest,
  buildNativeStructuredRequest,
  NativeProviderAdapter,
  parseNativeStructuredOutput,
} from './native';
import { CopilotProvider } from './provider';
import type {
  CopilotChatOptions,
  CopilotChatTools,
  CopilotEmbeddingOptions,
  CopilotImageOptions,
  CopilotRerankRequest,
  CopilotStructuredOptions,
  ModelCapability,
  ModelConditions,
  PromptMessage,
  StreamObject,
} from './types';
import { CopilotProviderType, ModelInputType, ModelOutputType } from './types';
import { promptAttachmentToUrl } from './utils';

export const DEFAULT_DIMENSIONS = 256;

const GPT_5_SAMPLING_UNSUPPORTED_MODELS = /^(gpt-5(?:$|[.-]))/;

export function normalizeOpenAIOptionsForModel<
  T extends {
    frequencyPenalty?: number | null;
    presencePenalty?: number | null;
    temperature?: number | null;
    topP?: number | null;
  },
>(options: T, model: string): T {
  if (!GPT_5_SAMPLING_UNSUPPORTED_MODELS.test(model)) {
    return options;
  }

  const normalizedOptions = { ...options };

  delete normalizedOptions.frequencyPenalty;
  delete normalizedOptions.presencePenalty;
  delete normalizedOptions.temperature;
  delete normalizedOptions.topP;

  return normalizedOptions;
}

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

function buildOpenAIRerankRequest(
  model: string,
  request: CopilotRerankRequest
): NativeLlmRerankRequest {
  return {
    model,
    query: request.query,
    candidates: request.candidates.map(candidate => ({
      ...(candidate.id ? { id: candidate.id } : {}),
      text: candidate.text,
    })),
    ...(request.topK ? { top_n: request.topK } : {}),
  };
}

function createOpenAIMultimodalCapability(
  output: ModelCapability['output'],
  options: Pick<ModelCapability, 'defaultForOutputType'> = {}
): ModelCapability {
  return {
    input: [ModelInputType.Text, ModelInputType.Image],
    output,
    attachments: IMAGE_ATTACHMENT_CAPABILITY,
    structuredAttachments: IMAGE_ATTACHMENT_CAPABILITY,
    ...options,
  };
}

export class OpenAIProvider extends CopilotProvider<OpenAIConfig> {
  readonly type = CopilotProviderType.OpenAI;

  readonly models = [
    // Text to Text models
    {
      name: 'GPT 4o',
      id: 'gpt-4o',
      capabilities: [
        createOpenAIMultimodalCapability([
          ModelOutputType.Text,
          ModelOutputType.Object,
        ]),
      ],
    },
    // FIXME(@darkskygit): deprecated
    {
      name: 'GPT 4o 2024-08-06',
      id: 'gpt-4o-2024-08-06',
      capabilities: [
        createOpenAIMultimodalCapability([
          ModelOutputType.Text,
          ModelOutputType.Object,
        ]),
      ],
    },
    {
      name: 'GPT 4o Mini',
      id: 'gpt-4o-mini',
      capabilities: [
        createOpenAIMultimodalCapability([
          ModelOutputType.Text,
          ModelOutputType.Object,
        ]),
      ],
    },
    // FIXME(@darkskygit): deprecated
    {
      name: 'GPT 4o Mini 2024-07-18',
      id: 'gpt-4o-mini-2024-07-18',
      capabilities: [
        createOpenAIMultimodalCapability([
          ModelOutputType.Text,
          ModelOutputType.Object,
        ]),
      ],
    },
    {
      name: 'GPT 4.1',
      id: 'gpt-4.1',
      capabilities: [
        createOpenAIMultimodalCapability(
          [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Rerank,
            ModelOutputType.Structured,
          ],
          { defaultForOutputType: true }
        ),
      ],
    },
    {
      name: 'GPT 4.1 2025-04-14',
      id: 'gpt-4.1-2025-04-14',
      capabilities: [
        createOpenAIMultimodalCapability([
          ModelOutputType.Text,
          ModelOutputType.Object,
          ModelOutputType.Rerank,
          ModelOutputType.Structured,
        ]),
      ],
    },
    {
      name: 'GPT 4.1 Mini',
      id: 'gpt-4.1-mini',
      capabilities: [
        createOpenAIMultimodalCapability([
          ModelOutputType.Text,
          ModelOutputType.Object,
          ModelOutputType.Rerank,
          ModelOutputType.Structured,
        ]),
      ],
    },
    {
      name: 'GPT 4.1 Nano',
      id: 'gpt-4.1-nano',
      capabilities: [
        createOpenAIMultimodalCapability([
          ModelOutputType.Text,
          ModelOutputType.Object,
          ModelOutputType.Rerank,
          ModelOutputType.Structured,
        ]),
      ],
    },
    {
      name: 'GPT 5',
      id: 'gpt-5',
      capabilities: [
        createOpenAIMultimodalCapability([
          ModelOutputType.Text,
          ModelOutputType.Object,
          ModelOutputType.Structured,
        ]),
      ],
    },
    {
      name: 'GPT 5 2025-08-07',
      id: 'gpt-5-2025-08-07',
      capabilities: [
        createOpenAIMultimodalCapability([
          ModelOutputType.Text,
          ModelOutputType.Object,
          ModelOutputType.Structured,
        ]),
      ],
    },
    {
      name: 'GPT 5 Mini',
      id: 'gpt-5-mini',
      capabilities: [
        createOpenAIMultimodalCapability([
          ModelOutputType.Text,
          ModelOutputType.Object,
          ModelOutputType.Structured,
        ]),
      ],
    },
    {
      name: 'GPT 5.2',
      id: 'gpt-5.2',
      capabilities: [
        createOpenAIMultimodalCapability([
          ModelOutputType.Text,
          ModelOutputType.Object,
          ModelOutputType.Rerank,
          ModelOutputType.Structured,
        ]),
      ],
    },
    {
      name: 'GPT 5.2 2025-12-11',
      id: 'gpt-5.2-2025-12-11',
      capabilities: [
        createOpenAIMultimodalCapability([
          ModelOutputType.Text,
          ModelOutputType.Object,
          ModelOutputType.Structured,
        ]),
      ],
    },
    {
      name: 'GPT 5 Nano',
      id: 'gpt-5-nano',
      capabilities: [
        createOpenAIMultimodalCapability([
          ModelOutputType.Text,
          ModelOutputType.Object,
          ModelOutputType.Structured,
        ]),
      ],
    },
    {
      name: 'GPT O1',
      id: 'o1',
      capabilities: [
        createOpenAIMultimodalCapability([
          ModelOutputType.Text,
          ModelOutputType.Object,
        ]),
      ],
    },
    {
      name: 'GPT O3',
      id: 'o3',
      capabilities: [
        createOpenAIMultimodalCapability([
          ModelOutputType.Text,
          ModelOutputType.Object,
        ]),
      ],
    },
    {
      name: 'GPT O4 Mini',
      id: 'o4-mini',
      capabilities: [
        createOpenAIMultimodalCapability([
          ModelOutputType.Text,
          ModelOutputType.Object,
        ]),
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
        createOpenAIMultimodalCapability([ModelOutputType.Image], {
          defaultForOutputType: true,
        }),
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
  ): [string, CopilotTool?] | undefined {
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

  private getNativeProtocol() {
    return this.config.oldApiStyle ? 'openai_chat' : 'openai_responses';
  }

  private createNativeAdapter(
    tools: CopilotToolSet,
    nodeTextMiddleware?: NodeTextMiddleware[]
  ) {
    return new NativeProviderAdapter(
      (request: NativeLlmRequest, signal?: AbortSignal) =>
        llmDispatchStream(
          this.getNativeProtocol(),
          this.createNativeConfig(),
          request,
          signal
        ),
      tools,
      this.MAX_STEPS,
      { nodeTextMiddleware }
    );
  }

  protected createNativeStructuredDispatch(
    backendConfig: NativeLlmBackendConfig
  ) {
    return (request: NativeLlmStructuredRequest) =>
      llmStructuredDispatch(this.getNativeProtocol(), backendConfig, request);
  }

  protected createNativeEmbeddingDispatch(
    backendConfig: NativeLlmBackendConfig
  ) {
    return (request: NativeLlmEmbeddingRequest) =>
      llmEmbeddingDispatch(this.getNativeProtocol(), backendConfig, request);
  }

  protected createNativeRerankDispatch(backendConfig: NativeLlmBackendConfig) {
    return (
      request: NativeLlmRerankRequest
    ): Promise<NativeLlmRerankResponse> =>
      llmRerankDispatch('openai_chat', backendConfig, request);
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
    const normalizedCond = await this.checkParams({
      messages,
      cond: fullCond,
      options,
    });
    const model = this.selectModel(normalizedCond);

    try {
      metrics.ai.counter('chat_text_calls').add(1, this.metricLabels(model.id));
      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const cap = this.getAttachCapability(model, ModelOutputType.Text);
      const normalizedOptions = normalizeOpenAIOptionsForModel(
        options,
        model.id
      );
      const { request } = await buildNativeRequest({
        model: model.id,
        messages,
        options: normalizedOptions,
        tools,
        attachmentCapability: cap,
        include: options.webSearch ? ['citations'] : undefined,
        reasoning: this.getReasoning(options, model.id),
        middleware,
      });
      const adapter = this.createNativeAdapter(tools, middleware.node?.text);
      return await adapter.text(request, options.signal, messages);
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
    const normalizedCond = await this.checkParams({
      messages,
      cond: fullCond,
      options,
    });
    const model = this.selectModel(normalizedCond);

    try {
      metrics.ai
        .counter('chat_text_stream_calls')
        .add(1, this.metricLabels(model.id));
      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const cap = this.getAttachCapability(model, ModelOutputType.Text);
      const normalizedOptions = normalizeOpenAIOptionsForModel(
        options,
        model.id
      );
      const { request } = await buildNativeRequest({
        model: model.id,
        messages,
        options: normalizedOptions,
        tools,
        attachmentCapability: cap,
        include: options.webSearch ? ['citations'] : undefined,
        reasoning: this.getReasoning(options, model.id),
        middleware,
      });
      const adapter = this.createNativeAdapter(tools, middleware.node?.text);
      for await (const chunk of adapter.streamText(
        request,
        options.signal,
        messages
      )) {
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
    const normalizedCond = await this.checkParams({
      cond: fullCond,
      messages,
      options,
    });
    const model = this.selectModel(normalizedCond);

    try {
      metrics.ai
        .counter('chat_object_stream_calls')
        .add(1, this.metricLabels(model.id));
      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const cap = this.getAttachCapability(model, ModelOutputType.Object);
      const normalizedOptions = normalizeOpenAIOptionsForModel(
        options,
        model.id
      );
      const { request } = await buildNativeRequest({
        model: model.id,
        messages,
        options: normalizedOptions,
        tools,
        attachmentCapability: cap,
        include: options.webSearch ? ['citations'] : undefined,
        reasoning: this.getReasoning(options, model.id),
        middleware,
      });
      const adapter = this.createNativeAdapter(tools, middleware.node?.text);
      for await (const chunk of adapter.streamObject(
        request,
        options.signal,
        messages
      )) {
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
    const normalizedCond = await this.checkParams({
      messages,
      cond: fullCond,
      options,
    });
    const model = this.selectModel(normalizedCond);

    try {
      metrics.ai.counter('chat_text_calls').add(1, this.metricLabels(model.id));
      const backendConfig = this.createNativeConfig();
      const middleware = this.getActiveProviderMiddleware();
      const cap = this.getAttachCapability(model, ModelOutputType.Structured);
      const normalizedOptions = normalizeOpenAIOptionsForModel(
        options,
        model.id
      );
      const { request, schema } = await buildNativeStructuredRequest({
        model: model.id,
        messages,
        options: normalizedOptions,
        attachmentCapability: cap,
        reasoning: this.getReasoning(options, model.id),
        responseSchema: options.schema,
        middleware,
      });
      const response =
        await this.createNativeStructuredDispatch(backendConfig)(request);
      const parsed = parseNativeStructuredOutput(response);
      const validated = schema.parse(parsed);
      return JSON.stringify(validated);
    } catch (e: any) {
      metrics.ai
        .counter('chat_text_errors')
        .add(1, this.metricLabels(model.id));
      throw this.handleError(e);
    }
  }

  override async rerank(
    cond: ModelConditions,
    request: CopilotRerankRequest,
    options: CopilotChatOptions = {}
  ): Promise<number[]> {
    const fullCond = { ...cond, outputType: ModelOutputType.Rerank };
    const normalizedCond = await this.checkParams({
      messages: [],
      cond: fullCond,
      options,
    });
    const model = this.selectModel(normalizedCond);

    try {
      const backendConfig = this.createNativeConfig();
      const nativeRequest = buildOpenAIRerankRequest(model.id, request);
      const response =
        await this.createNativeRerankDispatch(backendConfig)(nativeRequest);
      return response.scores;
    } catch (e: any) {
      throw this.handleError(e);
    }
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
      const url = promptAttachmentToUrl(entry);
      if (!url) continue;
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
    const normalizedCond = await this.checkParams({
      messages,
      cond: fullCond,
      options,
    });
    const model = this.selectModel(normalizedCond);

    metrics.ai
      .counter('generate_images_stream_calls')
      .add(1, this.metricLabels(model.id));

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
      metrics.ai
        .counter('generate_images_errors')
        .add(1, this.metricLabels(model.id));
      throw this.handleError(e);
    }
  }

  override async embedding(
    cond: ModelConditions,
    messages: string | string[],
    options: CopilotEmbeddingOptions = { dimensions: DEFAULT_DIMENSIONS }
  ): Promise<number[][]> {
    const input = Array.isArray(messages) ? messages : [messages];
    const fullCond = { ...cond, outputType: ModelOutputType.Embedding };
    const normalizedCond = await this.checkParams({
      embeddings: input,
      cond: fullCond,
      options,
    });
    const model = this.selectModel(normalizedCond);

    try {
      metrics.ai
        .counter('generate_embedding_calls')
        .add(1, this.metricLabels(model.id));
      const backendConfig = this.createNativeConfig();
      const response = await this.createNativeEmbeddingDispatch(backendConfig)(
        buildNativeEmbeddingRequest({
          model: model.id,
          inputs: input,
          dimensions: options.dimensions || DEFAULT_DIMENSIONS,
        })
      );
      return response.embeddings;
    } catch (e: any) {
      metrics.ai
        .counter('generate_embedding_errors')
        .add(1, this.metricLabels(model.id));
      throw this.handleError(e);
    }
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
