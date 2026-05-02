import { randomBytes } from 'node:crypto';

import serverNativeModule from '@affine/server-native';

import type { ProviderMiddlewareConfig } from '../../plugins/copilot/config';
import {
  CopilotChatOptions,
  CopilotEmbeddingOptions,
  type CopilotProviderModel,
  CopilotProviderType,
  CopilotStructuredOptions,
  ModelConditions,
  ModelFullConditions,
  ModelOutputType,
  PromptMessage,
  StreamObject,
} from '../../plugins/copilot/providers';
import {
  DEFAULT_DIMENSIONS,
  OpenAIProvider,
} from '../../plugins/copilot/providers/openai';
import type { ProviderModelRuntimeContext } from '../../plugins/copilot/providers/provider-model-runtime';
import {
  type CopilotProviderExecution,
  createNativeExecutionDriverSpec,
  type ProviderDriverSpec,
} from '../../plugins/copilot/providers/provider-runtime-contract';
import type { ProviderRuntimeContexts } from '../../plugins/copilot/runtime/provider-runtime-context';
import { sleep } from '../utils/utils';

const LLM_STREAM_END_MARKER = '__AFFINE_LLM_STREAM_END__';
const MOCK_NATIVE_TEXT = 'generate text to text';
const MOCK_NATIVE_STREAM_TEXT = 'generate text to text stream';

function mockUsage() {
  return {
    prompt_tokens: 1,
    completion_tokens: 1,
    total_tokens: 2,
  };
}

function buildMockDispatchResponse(model: string, text: string) {
  return {
    id: 'mock-dispatch',
    model,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
    },
    usage: mockUsage(),
    finish_reason: 'stop',
  };
}

function buildMockStructuredValue(schema: any, key?: string): any {
  if (!schema || typeof schema !== 'object') {
    return key === 'title' ? 'Weekly Sync' : MOCK_NATIVE_TEXT;
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return buildMockStructuredValue(schema.anyOf[0], key);
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return buildMockStructuredValue(schema.oneOf[0], key);
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  switch (schema.type) {
    case 'object': {
      const properties =
        schema.properties && typeof schema.properties === 'object'
          ? schema.properties
          : {};
      return Object.fromEntries(
        Object.entries(properties).map(([key, value]) => [
          key,
          buildMockStructuredValue(value, key),
        ])
      );
    }
    case 'array':
      return [buildMockStructuredValue(schema.items, key)];
    case 'boolean':
      return true;
    case 'number':
    case 'integer':
      switch (key) {
        case 'durationMinutes':
          return 45;
        case 's':
          return 30;
        case 'e':
          return 53;
        default:
          return 1;
      }
    case 'null':
      return null;
    case 'string':
    default:
      switch (key) {
        case 'title':
          return 'Weekly Sync';
        case 'description':
          return 'Send recap';
        case 'owner':
          return 'A';
        case 'deadline':
          return 'Friday';
        case 'speaker':
        case 'a':
          return 'A';
        case 'attendees':
          return 'A';
        case 'start':
          return '00:00:42';
        case 'end':
          return '00:01:05';
        case 'text':
        case 'transcription':
        case 't':
          return 'Hello, everyone.';
        case 'keyPoints':
          return 'Reviewed launch status';
        case 'decisions':
          return 'Ship on Monday';
        case 'openQuestions':
          return 'Need final QA sign-off';
        case 'blockers':
          return 'Waiting on analytics';
        case 'summary':
          return 'Reviewed launch status';
        default:
          return MOCK_NATIVE_TEXT;
      }
  }
}

function parseFirstRoute(routesJson: string) {
  const routes = JSON.parse(routesJson) as Array<{
    provider_id?: string;
    model?: string;
    request?: {
      model?: string;
      operation?: string;
      prompt?: string;
      schema?: unknown;
    };
  }>;
  return routes[0];
}

function buildMockStructuredResponse(model: string, schema: unknown) {
  const output_json = buildMockStructuredValue(schema);
  return {
    id: 'mock-structured-dispatch',
    model,
    output_text: JSON.stringify(output_json),
    output_json,
    usage: mockUsage(),
    finish_reason: 'stop',
  };
}

function emitMockTextStream(
  model: string,
  callback: (error: Error | null, eventJson: string) => void
) {
  callback(null, JSON.stringify({ type: 'message_start', model }));
  for (const text of MOCK_NATIVE_STREAM_TEXT) {
    callback(null, JSON.stringify({ type: 'text_delta', text }));
  }
  callback(
    null,
    JSON.stringify({
      type: 'done',
      finish_reason: 'stop',
      usage: mockUsage(),
    })
  );
  callback(null, LLM_STREAM_END_MARKER);
}

export function installMockCopilotRuntime() {
  const native = serverNativeModule as Record<string, any>;
  const original = {
    llmDispatchPrepared: native.llmDispatchPrepared,
    llmDispatchPreparedStream: native.llmDispatchPreparedStream,
    llmRenderBuiltInPrompt: native.llmRenderBuiltInPrompt,
    llmRenderBuiltInSessionPrompt: native.llmRenderBuiltInSessionPrompt,
    llmValidateJsonSchema: native.llmValidateJsonSchema,
    llmStructuredDispatch: native.llmStructuredDispatch,
    llmStructuredDispatchPrepared: native.llmStructuredDispatchPrepared,
    llmEmbeddingDispatch: native.llmEmbeddingDispatch,
    llmEmbeddingDispatchPrepared: native.llmEmbeddingDispatchPrepared,
    llmRerankDispatch: native.llmRerankDispatch,
    llmRerankDispatchPrepared: native.llmRerankDispatchPrepared,
    llmImageDispatchPrepared: native.llmImageDispatchPrepared,
    runNativeActionRecipePreparedStream:
      native.runNativeActionRecipePreparedStream,
  };

  native.llmDispatchPrepared = (routesJson: string) => {
    const route = parseFirstRoute(routesJson);
    return JSON.stringify({
      provider_id: route?.provider_id ?? 'mock-provider',
      response: buildMockDispatchResponse(
        route?.request?.model ?? route?.model ?? 'test',
        MOCK_NATIVE_TEXT
      ),
    });
  };

  native.llmDispatchPreparedStream = (
    routesJson: string,
    callback: (error: Error | null, eventJson: string) => void
  ) => {
    const route = parseFirstRoute(routesJson);
    emitMockTextStream(
      route?.request?.model ?? route?.model ?? 'test',
      callback
    );
    return { abort() {} };
  };

  native.llmStructuredDispatch = (
    _protocol: string,
    _backendConfigJson: string,
    requestJson: string
  ) => {
    const request = JSON.parse(requestJson) as {
      model?: string;
      schema?: unknown;
    };
    return JSON.stringify(
      buildMockStructuredResponse(request.model ?? 'test', request.schema)
    );
  };

  native.llmStructuredDispatchPrepared = (routesJson: string) => {
    const route = parseFirstRoute(routesJson);
    return JSON.stringify({
      provider_id: route?.provider_id ?? 'mock-provider',
      response: buildMockStructuredResponse(
        route?.request?.model ?? route?.model ?? 'test',
        route?.request?.schema
      ),
    });
  };

  native.llmValidateJsonSchema = (_schema: unknown, value: unknown) => value;

  native.llmEmbeddingDispatch = (
    _protocol: string,
    _backendConfigJson: string,
    requestJson: string
  ) => {
    const request = JSON.parse(requestJson) as {
      model?: string;
      dimensions?: number;
    };
    const length = request.dimensions ?? DEFAULT_DIMENSIONS;
    return JSON.stringify({
      model: request.model ?? 'test',
      embeddings: [
        Array.from({ length }, (_value, index) => (index % 128) + 1),
      ],
      usage: { prompt_tokens: 1, total_tokens: 1 },
    });
  };

  native.llmEmbeddingDispatchPrepared = (routesJson: string) => {
    const route = parseFirstRoute(routesJson);
    const response = JSON.parse(
      native.llmEmbeddingDispatch(
        '',
        '',
        JSON.stringify(route?.request ?? { model: route?.model ?? 'test' })
      )
    ) as Record<string, unknown>;
    return JSON.stringify({
      provider_id: route?.provider_id ?? 'mock-provider',
      response,
    });
  };

  native.llmRerankDispatch = (
    _protocol: string,
    _backendConfigJson: string,
    requestJson: string
  ) => {
    const request = JSON.parse(requestJson) as {
      model?: string;
      candidates?: unknown[];
    };
    const candidateCount = request.candidates?.length ?? 0;
    return JSON.stringify({
      model: request.model ?? 'test',
      scores: Array.from(
        { length: candidateCount },
        (_value, index) => candidateCount - index
      ),
    });
  };

  native.llmRerankDispatchPrepared = (routesJson: string) => {
    const route = parseFirstRoute(routesJson);
    const response = JSON.parse(
      native.llmRerankDispatch(
        '',
        '',
        JSON.stringify(route?.request ?? { model: route?.model ?? 'test' })
      )
    ) as Record<string, unknown>;
    return JSON.stringify({
      provider_id: route?.provider_id ?? 'mock-provider',
      response,
    });
  };

  native.llmImageDispatchPrepared = (routesJson: string) => {
    const route = parseFirstRoute(routesJson);
    const model = route?.request?.model ?? route?.model ?? 'test-image';
    const images = [
      {
        url: `https://example.com/${model}.jpg`,
        media_type: 'image/jpeg',
      },
    ];
    if (route?.request?.operation === 'edit' && route.request.prompt) {
      images.push({
        url: `https://example.com/generated/${encodeURIComponent(route.request.prompt)}.jpg`,
        media_type: 'image/jpeg',
      });
    }
    return JSON.stringify({
      provider_id: route?.provider_id ?? 'mock-provider',
      response: {
        images,
      },
    });
  };

  native.runNativeActionRecipePreparedStream = (
    input: {
      recipeId: string;
      recipeVersion?: string;
      input?: Record<string, any>;
    },
    callback: (error: Error | null, eventJson: string) => void
  ) => {
    const version = input.recipeVersion ?? 'v1';
    const result = input.recipeId.startsWith('image.filter.')
      ? {
          url: `https://example.com/${input.recipeId}.jpg`,
        }
      : MOCK_NATIVE_STREAM_TEXT;
    const attachmentEvent = input.recipeId.startsWith('image.filter.')
      ? [
          {
            type: 'attachment',
            actionId: input.recipeId,
            actionVersion: version,
            status: 'running',
            attachment: result,
          },
        ]
      : [];
    const events = [
      {
        type: 'action_start',
        actionId: input.recipeId,
        actionVersion: version,
        status: 'running',
      },
      {
        type: 'step_start',
        actionId: input.recipeId,
        actionVersion: version,
        stepId: 'generate',
        status: 'running',
      },
      ...attachmentEvent,
      {
        type: 'step_end',
        actionId: input.recipeId,
        actionVersion: version,
        stepId: 'generate',
        status: 'running',
      },
      {
        type: 'action_done',
        actionId: input.recipeId,
        actionVersion: version,
        status: 'succeeded',
        result,
        trace: {
          actionId: input.recipeId,
          actionVersion: version,
          status: 'succeeded',
          lightweight: [
            { type: 'action_start', status: 'running' },
            { type: 'action_trace', status: 'succeeded' },
          ],
        },
      },
    ];
    for (const event of events) {
      callback(null, JSON.stringify(event));
    }
    callback(null, LLM_STREAM_END_MARKER);
    return { abort() {} };
  };

  return () => {
    Object.assign(native, original);
  };
}

export class MockCopilotProvider extends OpenAIProvider {
  private runtimeHostOverride?: ProviderRuntimeContexts;

  protected override resolveModelRuntimeContext(): ProviderModelRuntimeContext {
    const providerType = this.type as CopilotProviderType;
    return {
      type: providerType,
      backendKind:
        providerType === CopilotProviderType.Gemini
          ? 'gemini_api'
          : 'openai_responses',
    };
  }

  override getDriverSpec(): ProviderDriverSpec {
    const spec = super.getDriverSpec();
    return {
      ...spec,
      image: {
        prepareMessages: async messages => messages,
      },
    };
  }

  private resolveMockModelId(
    cond: Pick<ModelFullConditions, 'modelId' | 'outputType'>
  ) {
    if (cond.modelId === 'test') {
      return 'gpt-5-mini';
    }
    if (cond.modelId === 'test-image') {
      return 'gpt-image-1';
    }
    return cond.modelId;
  }

  private normalizeMockConditions(
    cond: ModelFullConditions
  ): ModelFullConditions {
    const modelId = this.resolveMockModelId(cond);
    return modelId === cond.modelId ? cond : { ...cond, modelId };
  }

  protected override createDriverSpec(spec: ProviderDriverSpec) {
    return createNativeExecutionDriverSpec(spec, {
      createBackendConfig: spec.createBackendConfig,
      mapError: spec.mapError,
      checkParams: input => this.checkParams(input),
      selectModel: (cond, execution) => this.selectModel(cond, execution),
      getTools: this.getTools.bind(this),
      getActiveProviderMiddleware: this.getActiveProviderMiddleware.bind(this),
    });
  }

  override async match(
    cond: ModelFullConditions = {},
    execution?: CopilotProviderExecution
  ) {
    return await super.match(this.normalizeMockConditions(cond), execution);
  }

  override resolveModel(
    modelId: string,
    execution?: CopilotProviderExecution
  ): CopilotProviderModel | undefined {
    const resolvedModelId = this.resolveMockModelId({ modelId });
    return resolvedModelId
      ? super.resolveModel(resolvedModelId, execution)
      : undefined;
  }

  override selectModel(
    cond: ModelFullConditions,
    execution?: CopilotProviderExecution
  ): CopilotProviderModel {
    return super.selectModel(this.normalizeMockConditions(cond), execution);
  }

  override checkParams(input: Parameters<OpenAIProvider['checkParams']>[0]) {
    return super.checkParams({
      ...input,
      cond: this.normalizeMockConditions(input.cond),
    });
  }

  override getActiveProviderMiddleware(): ProviderMiddlewareConfig {
    return {};
  }

  overrideRuntimeHost(runtimeHost: ProviderRuntimeContexts) {
    if (!this.runtimeHostOverride) {
      const runtimeHostOverride: ProviderRuntimeContexts = {
        ...runtimeHost,
        run: {
          ...runtimeHost.run,
          text: this.text.bind(this),
          streamText: this.streamTextRuntime.bind(this),
          streamObject: this.streamObjectRuntime.bind(this),
          structured: this.structure.bind(this),
          embedding: this.embedding.bind(this),
        },
      };
      this.runtimeHostOverride = runtimeHostOverride;
    }

    return this.runtimeHostOverride;
  }

  private async *streamTextRuntime(
    cond: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions
  ): AsyncIterableIterator<string> {
    yield* this.streamText(cond, messages, options);
  }

  private async *streamObjectRuntime(
    cond: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions
  ): AsyncIterableIterator<StreamObject> {
    yield* this.streamObject(cond, messages, options);
  }

  async text(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): Promise<string> {
    const fullCond = {
      ...cond,
      outputType: ModelOutputType.Text,
    };
    await this.checkParams({
      messages,
      cond: fullCond,
      options,
    });
    // make some time gap for history test case
    await sleep(100);
    return 'generate text to text';
  }

  async *streamText(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Text };
    await this.checkParams({
      messages,
      cond: fullCond,
      options,
    });

    // make some time gap for history test case
    await sleep(100);

    const result = 'generate text to text stream';
    for (const message of result) {
      yield message;
      if (options.signal?.aborted) {
        break;
      }
    }
  }

  async structure(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotStructuredOptions = {}
  ): Promise<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Structured };
    await this.checkParams({
      messages,
      cond: fullCond,
      options,
    });

    // make some time gap for history test case
    await sleep(100);
    return 'generate text to text';
  }

  // ====== text to embedding ======

  async embedding(
    cond: ModelConditions,
    messages: string | string[],
    options: CopilotEmbeddingOptions = { dimensions: DEFAULT_DIMENSIONS }
  ): Promise<number[][]> {
    messages = Array.isArray(messages) ? messages : [messages];
    const fullCond = { ...cond, outputType: ModelOutputType.Embedding };
    await this.checkParams({
      embeddings: messages,
      cond: fullCond,
      options,
    });

    // make some time gap for history test case
    await sleep(100);
    return [
      Array.from(randomBytes(options.dimensions ?? DEFAULT_DIMENSIONS)).map(
        v => v % 128
      ),
    ];
  }

  async *streamObject(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): AsyncIterable<StreamObject> {
    const fullCond = { ...cond, outputType: ModelOutputType.Object };
    await this.checkParams({
      messages,
      cond: fullCond,
      options,
    });

    // make some time gap for history test case
    await sleep(100);

    const result = 'generate text to object stream';
    for (const data of result) {
      yield { type: 'text-delta', textDelta: data } as const;
      if (options.signal?.aborted) {
        break;
      }
    }
  }
}
