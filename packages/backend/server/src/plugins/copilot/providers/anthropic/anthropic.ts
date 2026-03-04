import type { ToolSet } from 'ai';

import {
  CopilotProviderSideError,
  metrics,
  UserFriendlyError,
} from '../../../../base';
import {
  llmDispatchStream,
  type NativeLlmBackendConfig,
  type NativeLlmRequest,
} from '../../../../native';
import type { NodeTextMiddleware } from '../../config';
import { buildNativeRequest, NativeProviderAdapter } from '../native';
import { CopilotProvider } from '../provider';
import type {
  CopilotChatOptions,
  ModelConditions,
  PromptMessage,
  StreamObject,
} from '../types';
import { CopilotProviderType, ModelOutputType } from '../types';
import { getGoogleAuth, getVertexAnthropicBaseUrl } from '../utils';

export abstract class AnthropicProvider<T> extends CopilotProvider<T> {
  private handleError(e: any) {
    if (e instanceof UserFriendlyError) {
      return e;
    }
    return new CopilotProviderSideError({
      provider: this.type,
      kind: 'unexpected_response',
      message: e?.message || 'Unexpected anthropic response',
    });
  }

  private async createNativeConfig(): Promise<NativeLlmBackendConfig> {
    if (this.type === CopilotProviderType.AnthropicVertex) {
      const auth = await getGoogleAuth(this.config as any, 'anthropic');
      const headers = auth.headers();
      const authorization =
        headers.Authorization ||
        (headers as Record<string, string | undefined>).authorization;
      const token =
        typeof authorization === 'string'
          ? authorization.replace(/^Bearer\s+/i, '')
          : '';
      const baseUrl =
        getVertexAnthropicBaseUrl(this.config as any) || auth.baseUrl;
      return {
        base_url: baseUrl || '',
        auth_token: token,
        request_layer: 'vertex',
        headers,
      };
    }

    const config = this.config as { apiKey: string; baseURL?: string };
    const baseUrl = config.baseURL || 'https://api.anthropic.com/v1';
    return {
      base_url: baseUrl.replace(/\/v1\/?$/, ''),
      auth_token: config.apiKey,
    };
  }

  private createAdapter(
    backendConfig: NativeLlmBackendConfig,
    tools: ToolSet,
    nodeTextMiddleware?: NodeTextMiddleware[]
  ) {
    return new NativeProviderAdapter(
      (request: NativeLlmRequest, signal?: AbortSignal) =>
        llmDispatchStream('anthropic', backendConfig, request, signal),
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
      return { budget_tokens: 12000, include_thought: true };
    }
    return undefined;
  }

  async text(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): Promise<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Text };
    await this.checkParams({ cond: fullCond, messages, options });
    const model = this.selectModel(fullCond);

    try {
      metrics.ai.counter('chat_text_calls').add(1, this.metricLabels(model.id));
      const backendConfig = await this.createNativeConfig();
      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const reasoning = this.getReasoning(options, model.id);
      const { request } = await buildNativeRequest({
        model: model.id,
        messages,
        options,
        tools,
        reasoning,
        middleware,
      });
      const adapter = this.createAdapter(
        backendConfig,
        tools,
        middleware.node?.text
      );
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
    const fullCond = { ...cond, outputType: ModelOutputType.Text };
    await this.checkParams({ cond: fullCond, messages, options });
    const model = this.selectModel(fullCond);

    try {
      metrics.ai
        .counter('chat_text_stream_calls')
        .add(1, this.metricLabels(model.id));
      const backendConfig = await this.createNativeConfig();
      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const { request } = await buildNativeRequest({
        model: model.id,
        messages,
        options,
        tools,
        reasoning: this.getReasoning(options, model.id),
        middleware,
      });
      const adapter = this.createAdapter(
        backendConfig,
        tools,
        middleware.node?.text
      );
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
      const backendConfig = await this.createNativeConfig();
      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const { request } = await buildNativeRequest({
        model: model.id,
        messages,
        options,
        tools,
        reasoning: this.getReasoning(options, model.id),
        middleware,
      });
      const adapter = this.createAdapter(
        backendConfig,
        tools,
        middleware.node?.text
      );
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

  private isReasoningModel(model: string) {
    // claude 3.5 sonnet doesn't support reasoning config
    return model.includes('sonnet') && !model.startsWith('claude-3-5-sonnet');
  }
}
