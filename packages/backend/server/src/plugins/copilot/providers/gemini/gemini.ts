import { setTimeout as delay } from 'node:timers/promises';

import { ZodError } from 'zod';

import {
  CopilotProviderSideError,
  metrics,
  OneMB,
  readResponseBufferWithLimit,
  safeFetch,
  UserFriendlyError,
} from '../../../../base';
import { sniffMime } from '../../../../base/storage/providers/utils';
import {
  llmDispatchStream,
  llmEmbeddingDispatch,
  llmStructuredDispatch,
  type NativeLlmBackendConfig,
  type NativeLlmEmbeddingRequest,
  type NativeLlmRequest,
  type NativeLlmStructuredRequest,
} from '../../../../native';
import type { NodeTextMiddleware } from '../../config';
import type { CopilotToolSet } from '../../tools';
import {
  buildNativeEmbeddingRequest,
  buildNativeRequest,
  buildNativeStructuredRequest,
  NativeProviderAdapter,
  parseNativeStructuredOutput,
  StructuredResponseParseError,
} from '../native';
import { CopilotProvider } from '../provider';
import type {
  CopilotChatOptions,
  CopilotEmbeddingOptions,
  CopilotImageOptions,
  CopilotStructuredOptions,
  ModelConditions,
  PromptAttachment,
  PromptMessage,
  StreamObject,
} from '../types';
import { ModelOutputType } from '../types';
import { promptAttachmentMimeType, promptAttachmentToUrl } from '../utils';

export const DEFAULT_DIMENSIONS = 256;
const GEMINI_REMOTE_ATTACHMENT_MAX_BYTES = 64 * OneMB;
const TRUSTED_ATTACHMENT_HOST_SUFFIXES = ['cdn.affine.pro'];
const GEMINI_RETRY_INITIAL_DELAY_MS = 2_000;

function normalizeMimeType(mediaType?: string) {
  return mediaType?.split(';', 1)[0]?.trim() || 'application/octet-stream';
}

function isYoutubeUrl(url: URL) {
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'youtu.be') {
    return /^\/[\w-]+$/.test(url.pathname);
  }

  if (hostname !== 'youtube.com' && hostname !== 'www.youtube.com') {
    return false;
  }

  if (url.pathname !== '/watch') {
    return false;
  }

  return !!url.searchParams.get('v');
}

function isGeminiFileUrl(url: URL, baseUrl: string) {
  try {
    const base = new URL(baseUrl);
    const basePath = base.pathname.replace(/\/+$/, '');
    return (
      url.origin === base.origin &&
      url.pathname.startsWith(`${basePath}/files/`)
    );
  } catch {
    return false;
  }
}

export abstract class GeminiProvider<T> extends CopilotProvider<T> {
  protected abstract createNativeConfig(): Promise<NativeLlmBackendConfig>;

  private handleError(e: any) {
    if (e instanceof UserFriendlyError) {
      return e;
    } else {
      return new CopilotProviderSideError({
        provider: this.type,
        kind: 'unexpected_response',
        message: e?.message || 'Unexpected google response',
      });
    }
  }

  protected createNativeDispatch(backendConfig: NativeLlmBackendConfig) {
    return (request: NativeLlmRequest, signal?: AbortSignal) =>
      llmDispatchStream('gemini', backendConfig, request, signal);
  }

  protected createNativeStructuredDispatch(
    backendConfig: NativeLlmBackendConfig
  ) {
    return (request: NativeLlmStructuredRequest) =>
      llmStructuredDispatch('gemini', backendConfig, request);
  }

  protected createNativeEmbeddingDispatch(
    backendConfig: NativeLlmBackendConfig
  ) {
    return (request: NativeLlmEmbeddingRequest) =>
      llmEmbeddingDispatch('gemini', backendConfig, request);
  }

  protected createNativeAdapter(
    backendConfig: NativeLlmBackendConfig,
    tools: CopilotToolSet,
    nodeTextMiddleware?: NodeTextMiddleware[]
  ) {
    return new NativeProviderAdapter(
      this.createNativeDispatch(backendConfig),
      tools,
      this.MAX_STEPS,
      { nodeTextMiddleware }
    );
  }

  protected async fetchRemoteAttach(url: string, signal?: AbortSignal) {
    const parsed = new URL(url);
    const response = await safeFetch(
      parsed,
      { method: 'GET', signal },
      this.buildAttachFetchOptions(parsed)
    );
    if (!response.ok) {
      throw new Error(
        `Failed to fetch attachment: ${response.status} ${response.statusText}`
      );
    }
    const buffer = await readResponseBufferWithLimit(
      response,
      GEMINI_REMOTE_ATTACHMENT_MAX_BYTES
    );
    const headerMimeType = normalizeMimeType(
      response.headers.get('content-type') || ''
    );
    return {
      data: buffer.toString('base64'),
      mimeType: normalizeMimeType(sniffMime(buffer, headerMimeType)),
    };
  }

  private buildAttachFetchOptions(url: URL) {
    const baseOptions = { timeoutMs: 15_000, maxRedirects: 3 } as const;
    if (!env.prod) {
      return { ...baseOptions, allowPrivateOrigins: new Set([url.origin]) };
    }

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

  private shouldInlineRemoteAttach(url: URL, config: NativeLlmBackendConfig) {
    switch (config.request_layer) {
      case 'gemini_api':
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
        return !(isGeminiFileUrl(url, config.base_url) || isYoutubeUrl(url));
      case 'gemini_vertex':
        return false;
      default:
        return false;
    }
  }

  private toInlineAttach(
    attachment: PromptAttachment,
    mimeType: string,
    data: string
  ): PromptAttachment {
    if (typeof attachment === 'string' || !('kind' in attachment)) {
      return { kind: 'bytes', data, mimeType };
    }

    if (attachment.kind !== 'url') {
      return attachment;
    }

    return {
      kind: 'bytes',
      data,
      mimeType,
      fileName: attachment.fileName,
      providerHint: attachment.providerHint,
    };
  }

  protected async prepareMessages(
    messages: PromptMessage[],
    backendConfig: NativeLlmBackendConfig,
    signal?: AbortSignal
  ): Promise<PromptMessage[]> {
    const prepared: PromptMessage[] = [];

    for (const message of messages) {
      signal?.throwIfAborted();
      if (!Array.isArray(message.attachments) || !message.attachments.length) {
        prepared.push(message);
        continue;
      }

      const attachments: PromptAttachment[] = [];
      let changed = false;
      for (const attachment of message.attachments) {
        signal?.throwIfAborted();
        const rawUrl = promptAttachmentToUrl(attachment);
        if (!rawUrl || rawUrl.startsWith('data:')) {
          attachments.push(attachment);
          continue;
        }

        let parsed: URL;
        try {
          parsed = new URL(rawUrl);
        } catch {
          attachments.push(attachment);
          continue;
        }

        if (!this.shouldInlineRemoteAttach(parsed, backendConfig)) {
          attachments.push(attachment);
          continue;
        }

        const declaredMimeType = promptAttachmentMimeType(
          attachment,
          typeof message.params?.mimetype === 'string'
            ? message.params.mimetype
            : undefined
        );
        const downloaded = await this.fetchRemoteAttach(rawUrl, signal);
        attachments.push(
          this.toInlineAttach(
            attachment,
            declaredMimeType
              ? normalizeMimeType(declaredMimeType)
              : downloaded.mimeType,
            downloaded.data
          )
        );
        changed = true;
      }

      prepared.push(changed ? { ...message, attachments } : message);
    }

    return prepared;
  }

  protected async waitForStructuredRetry(
    delayMs: number,
    signal?: AbortSignal
  ) {
    await delay(delayMs, undefined, signal ? { signal } : undefined);
  }

  async text(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): Promise<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Text };
    const normalizedCond = await this.checkParams({
      cond: fullCond,
      messages,
      options,
    });
    const model = this.selectModel(normalizedCond);

    try {
      metrics.ai.counter('chat_text_calls').add(1, this.metricLabels(model.id));
      const backendConfig = await this.createNativeConfig();
      const msg = await this.prepareMessages(
        messages,
        backendConfig,
        options.signal
      );
      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const cap = this.getAttachCapability(model, ModelOutputType.Text);
      const { request } = await buildNativeRequest({
        model: model.id,
        messages: msg,
        options,
        tools,
        attachmentCapability: cap,
        reasoning: this.getReasoning(options, model.id),
        middleware,
      });
      const adapter = this.createNativeAdapter(
        backendConfig,
        tools,
        middleware.node?.text
      );
      return await adapter.text(request, options.signal, messages);
    } catch (e: any) {
      metrics.ai
        .counter('chat_text_errors')
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
      cond: fullCond,
      messages,
      options,
    });
    const model = this.selectModel(normalizedCond);

    try {
      metrics.ai.counter('chat_text_calls').add(1, this.metricLabels(model.id));
      const backendConfig = await this.createNativeConfig();
      const msg = await this.prepareMessages(
        messages,
        backendConfig,
        options.signal
      );
      const structuredDispatch =
        this.createNativeStructuredDispatch(backendConfig);
      const middleware = this.getActiveProviderMiddleware();
      const cap = this.getAttachCapability(model, ModelOutputType.Structured);
      const { request, schema } = await buildNativeStructuredRequest({
        model: model.id,
        messages: msg,
        options,
        attachmentCapability: cap,
        reasoning: this.getReasoning(options, model.id),
        responseSchema: options.schema,
        middleware,
      });
      const maxRetries = Math.max(options.maxRetries ?? 3, 0);
      for (let attempt = 0; ; attempt++) {
        try {
          const response = await structuredDispatch(request);
          const parsed = parseNativeStructuredOutput(response);
          const validated = schema.parse(parsed);
          return JSON.stringify(validated);
        } catch (error) {
          const isParsingError =
            error instanceof StructuredResponseParseError ||
            error instanceof ZodError;
          const retryableError =
            isParsingError || !(error instanceof UserFriendlyError);
          if (!retryableError || attempt >= maxRetries) {
            throw error;
          }
          if (!isParsingError) {
            await this.waitForStructuredRetry(
              GEMINI_RETRY_INITIAL_DELAY_MS * 2 ** attempt,
              options.signal
            );
          }
        }
      }
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
    options: CopilotChatOptions | CopilotImageOptions = {}
  ): AsyncIterable<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Text };
    const normalizedCond = await this.checkParams({
      cond: fullCond,
      messages,
      options,
    });
    const model = this.selectModel(normalizedCond);

    try {
      metrics.ai
        .counter('chat_text_stream_calls')
        .add(1, this.metricLabels(model.id));
      const backendConfig = await this.createNativeConfig();
      const preparedMessages = await this.prepareMessages(
        messages,
        backendConfig,
        options.signal
      );
      const tools = await this.getTools(
        options as CopilotChatOptions,
        model.id
      );
      const middleware = this.getActiveProviderMiddleware();
      const cap = this.getAttachCapability(model, ModelOutputType.Text);
      const { request } = await buildNativeRequest({
        model: model.id,
        messages: preparedMessages,
        options: options as CopilotChatOptions,
        tools,
        attachmentCapability: cap,
        reasoning: this.getReasoning(options, model.id),
        middleware,
      });
      const adapter = this.createNativeAdapter(
        backendConfig,
        tools,
        middleware.node?.text
      );
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
      const backendConfig = await this.createNativeConfig();
      const msg = await this.prepareMessages(
        messages,
        backendConfig,
        options.signal
      );
      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const cap = this.getAttachCapability(model, ModelOutputType.Object);
      const { request } = await buildNativeRequest({
        model: model.id,
        messages: msg,
        options,
        tools,
        attachmentCapability: cap,
        reasoning: this.getReasoning(options, model.id),
        middleware,
      });
      const adapter = this.createNativeAdapter(
        backendConfig,
        tools,
        middleware.node?.text
      );
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

  override async embedding(
    cond: ModelConditions,
    messages: string | string[],
    options: CopilotEmbeddingOptions = { dimensions: DEFAULT_DIMENSIONS }
  ): Promise<number[][]> {
    const values = Array.isArray(messages) ? messages : [messages];
    const fullCond = { ...cond, outputType: ModelOutputType.Embedding };
    const normalizedCond = await this.checkParams({
      embeddings: values,
      cond: fullCond,
      options,
    });
    const model = this.selectModel(normalizedCond);

    try {
      metrics.ai
        .counter('generate_embedding_calls')
        .add(1, this.metricLabels(model.id));
      const backendConfig = await this.createNativeConfig();
      const response = await this.createNativeEmbeddingDispatch(backendConfig)(
        buildNativeEmbeddingRequest({
          model: model.id,
          inputs: values,
          dimensions: options.dimensions || DEFAULT_DIMENSIONS,
          taskType: 'RETRIEVAL_DOCUMENT',
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

  protected getReasoning(
    options: CopilotChatOptions | CopilotImageOptions,
    model: string
  ): Record<string, unknown> | undefined {
    if (
      options &&
      'reasoning' in options &&
      options.reasoning &&
      this.isReasoningModel(model)
    ) {
      return this.isGemini3Model(model)
        ? { include_thoughts: true, thinking_level: 'high' }
        : { include_thoughts: true, thinking_budget: 12000 };
    }

    return undefined;
  }

  private isGemini3Model(model: string) {
    return model.startsWith('gemini-3');
  }

  private isReasoningModel(model: string) {
    return model.startsWith('gemini-2.5') || this.isGemini3Model(model);
  }
}
