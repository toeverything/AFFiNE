import {
  CopilotProviderSideError,
  metrics,
  UserFriendlyError,
} from '../../../base';
import {
  llmDispatchStream,
  type NativeLlmBackendConfig,
  type NativeLlmRequest,
} from '../../../native';
import type { NodeTextMiddleware } from '../config';
import type { CopilotToolSet } from '../tools';
import { buildNativeRequest, NativeProviderAdapter } from './native';
import { CopilotProvider } from './provider';
import type {
  CopilotChatOptions,
  ModelConditions,
  PromptMessage,
} from './types';
import { CopilotProviderType, ModelInputType, ModelOutputType } from './types';

export const DEFAULT_DIMENSIONS = 256;

export type MorphConfig = {
  apiKey?: string;
};

export class MorphProvider extends CopilotProvider<MorphConfig> {
  readonly type = CopilotProviderType.Morph;

  readonly models = [
    {
      id: 'morph-v2',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Text],
        },
      ],
    },
    {
      id: 'morph-v3-fast',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Text],
        },
      ],
    },
    {
      id: 'morph-v3-large',
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

  private handleError(e: any) {
    if (e instanceof UserFriendlyError) {
      return e;
    }
    return new CopilotProviderSideError({
      provider: this.type,
      kind: 'unexpected_response',
      message: e?.message || 'Unexpected morph response',
    });
  }

  private createNativeConfig(): NativeLlmBackendConfig {
    return {
      base_url: 'https://api.morphllm.com',
      auth_token: this.config.apiKey ?? '',
    };
  }

  private createNativeAdapter(
    tools: CopilotToolSet,
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
    const model = this.selectModel(
      await this.checkParams({
        messages,
        cond: fullCond,
        options,
      })
    );

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
    const fullCond = { ...cond, outputType: ModelOutputType.Text };
    const model = this.selectModel(
      await this.checkParams({
        messages,
        cond: fullCond,
        options,
      })
    );

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
}
