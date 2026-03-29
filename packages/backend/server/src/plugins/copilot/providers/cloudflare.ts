import {
  CopilotProviderSideError,
  metrics,
  UserFriendlyError,
} from '../../../base';
import {
  llmDispatchStream,
  llmRerankDispatch,
  type NativeLlmBackendConfig,
  type NativeLlmRequest,
  type NativeLlmRerankRequest,
  type NativeLlmRerankResponse,
} from '../../../native';
import type { NodeTextMiddleware } from '../config';
import type { CopilotTool, CopilotToolSet } from '../tools';
import {
  buildNativeRequest,
  buildNativeRerankRequest,
  NativeProviderAdapter,
} from './native';
import { CopilotProvider } from './provider';
import type {
  CopilotChatOptions,
  CopilotChatTools,
  CopilotProviderModel,
  CopilotRerankRequest,
  ModelConditions,
  PromptMessage,
  StreamObject,
} from './types';
import { CopilotProviderType, ModelInputType, ModelOutputType } from './types';

export type CloudflareWorkersAIConfig = {
  apiToken: string;
  accountId?: string;
  baseURL?: string;
};

function rerankOnlyModel(
  id: string,
  name: string,
  defaultForOutputType = false
): CopilotProviderModel {
  return {
    name,
    id,
    capabilities: [
      {
        input: [ModelInputType.Text],
        output: [ModelOutputType.Rerank],
        ...(defaultForOutputType ? { defaultForOutputType } : {}),
      },
    ],
  };
}

function chatAndRerankModel(
  id: string,
  name: string,
  defaultForRerank = false
): CopilotProviderModel {
  return {
    name,
    id,
    capabilities: [
      {
        input: [ModelInputType.Text],
        output: [
          ModelOutputType.Text,
          ModelOutputType.Object,
          ModelOutputType.Rerank,
        ],
        ...(defaultForRerank ? { defaultForOutputType: true } : {}),
      },
    ],
  };
}

export class CloudflareWorkersAIProvider extends CopilotProvider<CloudflareWorkersAIConfig> {
  override readonly type = CopilotProviderType.CloudflareWorkersAi;

  override readonly models = [
    rerankOnlyModel('@cf/baai/bge-reranker-base', 'BGE Reranker Base', true),
    chatAndRerankModel('@cf/moonshotai/kimi-k2.5', 'Kimi K2.5'),
    chatAndRerankModel(
      '@cf/ibm-granite/granite-4.0-h-micro',
      'Granite 4.0 H Micro'
    ),
    chatAndRerankModel(
      '@cf/aisingapore/gemma-sea-lion-v4-27b-it',
      'Gemma Sea Lion V4 27B IT'
    ),
    chatAndRerankModel(
      '@cf/nvidia/nemotron-3-120b-a12b',
      'Nemotron 3 120B A12B'
    ),
    chatAndRerankModel('@cf/zai-org/glm-4.7-flash', 'GLM 4.7 Flash'),
    chatAndRerankModel('@cf/qwen/qwen3-30b-a3b-fp8', 'Qwen3 30B A3B FP8'),
  ];

  override configured(): boolean {
    return (
      !!this.config.apiToken &&
      (!!this.config.accountId || !!this.config.baseURL)
    );
  }

  override async refreshOnlineModels() {}

  override getProviderSpecificTools(
    toolName: CopilotChatTools,
    _model: string
  ): [string, CopilotTool?] | undefined {
    if (toolName === 'docEdit') {
      return ['doc_edit', undefined];
    }
    return;
  }

  private handleError(e: any) {
    if (e instanceof UserFriendlyError) {
      return e;
    }
    return new CopilotProviderSideError({
      provider: this.type,
      kind: 'unexpected_response',
      message: e?.message || 'Unexpected cloudflare workers ai response',
    });
  }

  private createNativeConfig(): NativeLlmBackendConfig {
    return {
      base_url: this.resolveBaseUrl(),
      auth_token: this.config.apiToken,
      request_layer: 'cloudflare_workers_ai',
    };
  }

  private createNativeDispatch(
    backendConfig: NativeLlmBackendConfig,
    tools: CopilotToolSet,
    nodeTextMiddleware?: NodeTextMiddleware[]
  ) {
    return new NativeProviderAdapter(
      (request: NativeLlmRequest, signal?: AbortSignal) =>
        llmDispatchStream('openai_chat', backendConfig, request, signal),
      tools,
      this.MAX_STEPS,
      { nodeTextMiddleware }
    );
  }

  private createNativeRerankDispatch(backendConfig: NativeLlmBackendConfig) {
    return (
      request: NativeLlmRerankRequest
    ): Promise<NativeLlmRerankResponse> =>
      llmRerankDispatch('openai_chat', backendConfig, request);
  }

  private resolveBaseUrl() {
    if (this.config.baseURL) {
      return this.config.baseURL.replace(/\/v1\/?$/, '').replace(/\/$/, '');
    }
    const accountId = this.config.accountId ?? '';
    return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai`;
  }

  override async text(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): Promise<string> {
    const normalizedCond = await this.checkParams({
      messages,
      cond: { ...cond, outputType: ModelOutputType.Text },
      options,
    });
    const model = this.selectModel(normalizedCond);

    try {
      metrics.ai.counter('chat_text_calls').add(1, this.metricLabels(model.id));
      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const { request } = await buildNativeRequest({
        model: model.id,
        messages,
        options,
        tools,
        middleware,
      });
      return await this.createNativeDispatch(
        this.createNativeConfig(),
        tools,
        middleware.node?.text
      ).text(request, options.signal, messages);
    } catch (e: any) {
      metrics.ai
        .counter('chat_text_errors')
        .add(1, this.metricLabels(model.id));
      throw this.handleError(e);
    }
  }

  override async *streamText(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    const normalizedCond = await this.checkParams({
      messages,
      cond: { ...cond, outputType: ModelOutputType.Text },
      options,
    });
    const model = this.selectModel(normalizedCond);

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
        middleware,
      });
      for await (const chunk of this.createNativeDispatch(
        this.createNativeConfig(),
        tools,
        middleware.node?.text
      ).streamText(request, options.signal, messages)) {
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
    const normalizedCond = await this.checkParams({
      messages,
      cond: { ...cond, outputType: ModelOutputType.Object },
      options,
    });
    const model = this.selectModel(normalizedCond);

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
        middleware,
      });
      for await (const chunk of this.createNativeDispatch(
        this.createNativeConfig(),
        tools,
        middleware.node?.text
      ).streamObject(request, options.signal, messages)) {
        yield chunk;
      }
    } catch (e: any) {
      metrics.ai
        .counter('chat_object_stream_errors')
        .add(1, this.metricLabels(model.id));
      throw this.handleError(e);
    }
  }

  override async rerank(
    cond: ModelConditions,
    request: CopilotRerankRequest,
    options: CopilotChatOptions = {}
  ): Promise<number[]> {
    const normalizedCond = await this.checkParams({
      messages: [],
      cond: { ...cond, outputType: ModelOutputType.Rerank },
      options,
    });
    const model = this.selectModel(normalizedCond);

    try {
      const response = await this.createNativeRerankDispatch(
        this.createNativeConfig()
      )(buildNativeRerankRequest(model.id, request));
      return response.scores;
    } catch (e: any) {
      throw this.handleError(e);
    }
  }
}
