import type { ToolSet } from 'ai';

import { CopilotProviderSideError, metrics } from '../../../base';
import {
  llmDispatchStream,
  type NativeLlmBackendConfig,
  type NativeLlmRequest,
} from '../../../native';
import type { NodeTextMiddleware } from '../config';
import { buildNativeRequest, NativeProviderAdapter } from './native';
import { CopilotProvider } from './provider';
import {
  CopilotChatOptions,
  CopilotProviderType,
  ModelConditions,
  ModelInputType,
  ModelOutputType,
  PromptMessage,
} from './types';

export type PerplexityConfig = {
  apiKey: string;
  endpoint?: string;
};

export class PerplexityProvider extends CopilotProvider<PerplexityConfig> {
  readonly type = CopilotProviderType.Perplexity;

  readonly models = [
    {
      name: 'Sonar',
      id: 'sonar',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Text],
          defaultForOutputType: true,
        },
      ],
    },
    {
      name: 'Sonar Pro',
      id: 'sonar-pro',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Text],
        },
      ],
    },
    {
      name: 'Sonar Reasoning',
      id: 'sonar-reasoning',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Text],
        },
      ],
    },
    {
      name: 'Sonar Reasoning Pro',
      id: 'sonar-reasoning-pro',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Text],
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

  private createNativeConfig(): NativeLlmBackendConfig {
    const baseUrl = this.config.endpoint || 'https://api.perplexity.ai';
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
          'openai_chat',
          this.createNativeConfig(),
          request,
          signal
        ),
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
    await this.checkParams({ cond: fullCond, messages, options });
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
        withAttachment: false,
        include: ['citations'],
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
    const fullCond = { ...cond, outputType: ModelOutputType.Text };
    await this.checkParams({ cond: fullCond, messages, options });
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
        withAttachment: false,
        include: ['citations'],
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

  private handleError(e: any) {
    if (e instanceof CopilotProviderSideError) {
      return e;
    }
    return new CopilotProviderSideError({
      provider: this.type,
      kind: 'unexpected_response',
      message: e?.message || 'Unexpected perplexity response',
    });
  }
}
