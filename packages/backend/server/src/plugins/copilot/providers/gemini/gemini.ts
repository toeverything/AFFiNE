import { ZodError } from 'zod';

import {
  CopilotProviderSideError,
  metrics,
  UserFriendlyError,
} from '../../../../base';
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
  PromptMessage,
  StreamObject,
} from '../types';
import { ModelOutputType } from '../types';

export const DEFAULT_DIMENSIONS = 256;

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
      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const cap = this.getAttachCapability(model, ModelOutputType.Text);
      const { request } = await buildNativeRequest({
        model: model.id,
        messages,
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
      const structuredDispatch =
        this.createNativeStructuredDispatch(backendConfig);
      const middleware = this.getActiveProviderMiddleware();
      const cap = this.getAttachCapability(model, ModelOutputType.Structured);
      const { request, schema } = await buildNativeStructuredRequest({
        model: model.id,
        messages,
        options,
        attachmentCapability: cap,
        reasoning: this.getReasoning(options, model.id),
        responseSchema: options.schema,
        middleware,
      });
      let lastError: unknown;
      const maxAttempts = Math.max(options.maxRetries ?? 3, 1);
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const response = await structuredDispatch(request);
        try {
          const parsed = parseNativeStructuredOutput(response);
          const validated = schema.parse(parsed);
          return JSON.stringify(validated);
        } catch (error) {
          lastError = error;
          const retryableError =
            error instanceof StructuredResponseParseError ||
            error instanceof ZodError;
          if (!retryableError || attempt === maxAttempts - 1) {
            throw error;
          }
        }
      }
      throw lastError;
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
      const tools = await this.getTools(
        options as CopilotChatOptions,
        model.id
      );
      const middleware = this.getActiveProviderMiddleware();
      const cap = this.getAttachCapability(model, ModelOutputType.Text);
      const { request } = await buildNativeRequest({
        model: model.id,
        messages,
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
      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const cap = this.getAttachCapability(model, ModelOutputType.Object);
      const { request } = await buildNativeRequest({
        model: model.id,
        messages,
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
          middleware: this.getActiveProviderMiddleware(),
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
