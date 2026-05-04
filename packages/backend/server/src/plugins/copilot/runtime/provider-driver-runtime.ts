import {
  CopilotPromptInvalid,
  CopilotProviderNotSupported,
  metrics,
} from '../../../base';
import {
  buildLlmEmbeddingRequest,
  buildLlmRerankRequest,
  type LlmBackendConfig,
  type LlmEmbeddingRequest,
  type LlmProtocol,
  type LlmRerankRequest,
  type LlmStructuredRequest,
  type LlmStructuredResponse,
  llmValidateJsonSchema,
  parseNativeStructuredOutput,
} from '../../../native';
import type { ProviderMiddlewareConfig } from '../config';
import { resolveProviderModelRoute } from '../providers/provider-model-runtime';
import type {
  CopilotProviderExecution,
  EmbeddingProviderDriver,
  ImageProviderDriver,
  PreparedNativeEmbeddingExecution,
  PreparedNativeImageExecution,
  PreparedNativeRerankExecution,
  PreparedNativeStructuredExecution,
  RerankProviderDriver,
  StructuredProviderDriver,
} from '../providers/provider-runtime-contract';
import type {
  CopilotChatOptions,
  CopilotEmbeddingOptions,
  CopilotImageOptions,
  CopilotProviderModel,
  CopilotProviderType,
  CopilotRerankRequest,
  CopilotStructuredOptions,
  ModelAttachmentCapability,
  ModelConditions,
  ModelFullConditions,
  PromptMessage,
} from '../providers/types';
import { ModelOutputType } from '../providers/types';
import { type RequiredStructuredOutputContract } from './contracts';
import { buildNativeStructuredRequest } from './native-request-runtime';

const DEFAULT_EMBEDDING_TASK_TYPE = 'RETRIEVAL_DOCUMENT';

type MetricLabels = Record<string, string | number | boolean | undefined>;
type DriverMetricNames = {
  call: string;
  error: string;
};

export type StructuredRuntimeContext = {
  type: CopilotProviderType;
  resolveStructuredDriver: () => StructuredProviderDriver | undefined;
  checkParams: (input: {
    cond: ModelFullConditions;
    messages?: PromptMessage[];
    embeddings?: string[];
    options?:
      | CopilotChatOptions
      | CopilotStructuredOptions
      | CopilotImageOptions;
    withAttachment?: boolean;
    execution?: CopilotProviderExecution;
  }) => Promise<ModelFullConditions>;
  selectModel: (
    cond: ModelFullConditions,
    execution?: CopilotProviderExecution
  ) => CopilotProviderModel;
  getAttachCapability: (
    model: CopilotProviderModel,
    outputType: ModelOutputType
  ) => ModelAttachmentCapability | undefined;
  getActiveProviderMiddleware: (
    execution?: CopilotProviderExecution
  ) => ProviderMiddlewareConfig;
  buildPreparedNativeStructuredExecution: (
    protocol: LlmProtocol,
    backendConfig: LlmBackendConfig,
    model: string,
    request: LlmStructuredRequest,
    execution?: CopilotProviderExecution
  ) => PreparedNativeStructuredExecution;
  createNativeStructuredDispatch: (
    backendConfig: LlmBackendConfig,
    protocol: LlmProtocol,
    execution?: CopilotProviderExecution
  ) => (request: LlmStructuredRequest) => Promise<LlmStructuredResponse>;
  metricLabels: (
    model: string,
    labels?: MetricLabels,
    execution?: CopilotProviderExecution
  ) => MetricLabels;
};

export type EmbeddingRuntimeContext = {
  type: CopilotProviderType;
  resolveEmbeddingDriver: () => EmbeddingProviderDriver | undefined;
  checkParams: (input: {
    cond: ModelFullConditions;
    messages?: PromptMessage[];
    embeddings?: string[];
    options?:
      | CopilotChatOptions
      | CopilotStructuredOptions
      | CopilotImageOptions;
    withAttachment?: boolean;
    execution?: CopilotProviderExecution;
  }) => Promise<ModelFullConditions>;
  selectModel: (
    cond: ModelFullConditions,
    execution?: CopilotProviderExecution
  ) => CopilotProviderModel;
  buildPreparedNativeEmbeddingExecution: (
    protocol: LlmProtocol,
    backendConfig: LlmBackendConfig,
    model: string,
    request: LlmEmbeddingRequest,
    execution?: CopilotProviderExecution
  ) => PreparedNativeEmbeddingExecution;
  createNativeEmbeddingDispatch: (
    backendConfig: LlmBackendConfig,
    protocol: LlmProtocol,
    execution?: CopilotProviderExecution
  ) => (request: LlmEmbeddingRequest) => Promise<{ embeddings: number[][] }>;
  metricLabels: (
    model: string,
    labels?: MetricLabels,
    execution?: CopilotProviderExecution
  ) => MetricLabels;
};

export type RerankRuntimeContext = {
  type: CopilotProviderType;
  resolveRerankDriver: () => RerankProviderDriver | undefined;
  checkParams: (input: {
    cond: ModelFullConditions;
    messages?: PromptMessage[];
    embeddings?: string[];
    options?:
      | CopilotChatOptions
      | CopilotStructuredOptions
      | CopilotImageOptions;
    withAttachment?: boolean;
    execution?: CopilotProviderExecution;
  }) => Promise<ModelFullConditions>;
  selectModel: (
    cond: ModelFullConditions,
    execution?: CopilotProviderExecution
  ) => CopilotProviderModel;
  buildPreparedNativeRerankExecution: (
    protocol: LlmProtocol,
    backendConfig: LlmBackendConfig,
    model: string,
    request: LlmRerankRequest,
    execution?: CopilotProviderExecution
  ) => PreparedNativeRerankExecution;
  createNativeRerankDispatch: (
    backendConfig: LlmBackendConfig,
    protocol: LlmProtocol,
    execution?: CopilotProviderExecution
  ) => (request: LlmRerankRequest) => Promise<{ scores: number[] }>;
};

export type ImageRuntimeContext = {
  type: CopilotProviderType;
  resolveImageDriver: () => ImageProviderDriver | undefined;
  checkParams: (input: {
    cond: ModelFullConditions;
    messages?: PromptMessage[];
    options?: CopilotImageOptions;
    withAttachment?: boolean;
    execution?: CopilotProviderExecution;
  }) => Promise<ModelFullConditions>;
  selectModel: (
    cond: ModelFullConditions,
    execution?: CopilotProviderExecution
  ) => CopilotProviderModel;
  buildPreparedNativeImageExecution: (
    protocol: LlmProtocol,
    backendConfig: LlmBackendConfig,
    model: string,
    messages: PromptMessage[],
    options?: CopilotImageOptions,
    execution?: CopilotProviderExecution
  ) => PreparedNativeImageExecution;
};

type NativeExecutionDriverBase = {
  createBackendConfig: (
    execution?: CopilotProviderExecution
  ) => Promise<LlmBackendConfig> | LlmBackendConfig;
  mapError: (error: unknown) => unknown;
};

type ModelSelectionContext = {
  selectModel: (
    cond: ModelFullConditions,
    execution?: CopilotProviderExecution
  ) => CopilotProviderModel;
};

type MetricContext = {
  metricLabels: (
    model: string,
    labels?: MetricLabels,
    execution?: CopilotProviderExecution
  ) => MetricLabels;
};

type RoutedPreparedExecution = {
  route: {
    model: string;
    backendConfig: LlmBackendConfig;
    protocol: LlmProtocol;
  };
};

export function resolveDriverOrThrow<TDriver>(
  type: CopilotProviderType,
  kind: string,
  resolveDriver: () => TDriver | undefined
) {
  const driver = resolveDriver();
  if (!driver) {
    throw new CopilotProviderNotSupported({
      provider: type,
      kind,
    });
  }
  return driver;
}

export function resolvePreparedModelId(
  context: ModelSelectionContext,
  cond: ModelConditions,
  outputType: ModelOutputType,
  prepared?: RoutedPreparedExecution | null
) {
  return (
    prepared?.route.model ??
    context.selectModel({
      ...cond,
      outputType,
    }).id
  );
}

async function prepareNativeExecutionBase<
  TDriver extends NativeExecutionDriverBase,
  TPrepared,
>({
  resolveDriver,
  cond,
  outputType,
  checkParams,
  selectModel,
  execution,
  checkInput,
  buildPrepared,
}: {
  resolveDriver: () => TDriver | undefined;
  cond: ModelConditions;
  outputType: ModelOutputType;
  checkParams: (input: {
    cond: ModelFullConditions;
    messages?: PromptMessage[];
    embeddings?: string[];
    options?:
      | CopilotChatOptions
      | CopilotStructuredOptions
      | CopilotImageOptions;
    withAttachment?: boolean;
    execution?: CopilotProviderExecution;
  }) => Promise<ModelFullConditions>;
  selectModel: (
    cond: ModelFullConditions,
    execution?: CopilotProviderExecution
  ) => CopilotProviderModel;
  execution?: CopilotProviderExecution;
  checkInput: {
    messages?: PromptMessage[];
    embeddings?: string[];
    options?:
      | CopilotChatOptions
      | CopilotStructuredOptions
      | CopilotImageOptions;
    withAttachment?: boolean;
  };
  buildPrepared: (args: {
    driver: TDriver;
    model: CopilotProviderModel;
    backendConfig: LlmBackendConfig;
    protocol: LlmProtocol;
  }) => Promise<TPrepared> | TPrepared;
}): Promise<TPrepared | null> {
  const driver = resolveDriver();
  if (!driver) {
    return null;
  }

  const normalizedCond = await checkParams({
    ...checkInput,
    cond: { ...cond, outputType },
    execution,
  });
  const model = selectModel(normalizedCond, execution);
  const backendConfig = await driver.createBackendConfig(execution);
  const route = resolveProviderModelRoute(model, outputType);
  if (!route.protocol) {
    throw new Error(`Missing native protocol for model ${model.id}`);
  }

  return await buildPrepared({
    driver,
    model,
    backendConfig:
      route.requestLayer === backendConfig.request_layer
        ? backendConfig
        : { ...backendConfig, request_layer: route.requestLayer },
    protocol: route.protocol,
  });
}

export async function runPreparedExecution<
  TPrepared extends RoutedPreparedExecution,
  TResult,
>({
  driver,
  prepared,
  modelId,
  execution,
  metricContext,
  metricsName,
  execute,
}: {
  driver: Pick<NativeExecutionDriverBase, 'mapError'>;
  prepared: TPrepared | null;
  modelId: string;
  execution?: CopilotProviderExecution;
  metricContext?: MetricContext;
  metricsName?: DriverMetricNames;
  execute: (prepared: TPrepared) => Promise<TResult>;
}): Promise<TResult> {
  try {
    if (metricsName && metricContext) {
      metrics.ai
        .counter(metricsName.call)
        .add(1, metricContext.metricLabels(modelId, {}, execution));
    }
    if (!prepared) {
      throw new Error('native route is not available');
    }
    return await execute(prepared);
  } catch (error) {
    if (metricsName && metricContext) {
      metrics.ai
        .counter(metricsName.error)
        .add(1, metricContext.metricLabels(modelId, {}, execution));
    }
    throw driver.mapError(error);
  }
}

export async function prepareNativeStructuredExecution(
  context: StructuredRuntimeContext,
  cond: ModelConditions,
  messages: PromptMessage[],
  options: CopilotStructuredOptions = {},
  responseContract?: RequiredStructuredOutputContract,
  execution?: CopilotProviderExecution
): Promise<PreparedNativeStructuredExecution | null> {
  const driver = context.resolveStructuredDriver();
  if (!driver) {
    return null;
  }

  const structuredOptions = options ?? {};
  const normalizedCond = await context.checkParams({
    messages,
    cond: { ...cond, outputType: ModelOutputType.Structured },
    options: structuredOptions,
    execution,
  });
  const model = context.selectModel(normalizedCond, execution);
  const backendConfig = await driver.createBackendConfig(execution);
  const route = resolveProviderModelRoute(model, ModelOutputType.Structured);
  if (!route.protocol) {
    throw new Error(`Missing native protocol for model ${model.id}`);
  }
  const preparedMessages = driver.prepareMessages
    ? await driver.prepareMessages(messages, backendConfig, structuredOptions)
    : messages;
  if (!responseContract) {
    throw new CopilotPromptInvalid('Schema is required');
  }
  const { request } = await buildNativeStructuredRequest({
    model: model.id,
    messages: preparedMessages,
    options: structuredOptions,
    responseContract,
    attachmentCapability: context.getAttachCapability(
      model,
      ModelOutputType.Structured
    ),
    middleware: context.getActiveProviderMiddleware(execution),
  });

  return context.buildPreparedNativeStructuredExecution(
    route.protocol,
    route.requestLayer === backendConfig.request_layer
      ? backendConfig
      : { ...backendConfig, request_layer: route.requestLayer },
    model.id,
    request,
    execution
  );
}

export async function runNativeStructured(
  context: StructuredRuntimeContext,
  cond: ModelConditions,
  messages: PromptMessage[],
  options: CopilotStructuredOptions = {},
  responseContract?: RequiredStructuredOutputContract,
  execution?: CopilotProviderExecution
) {
  const driver = resolveDriverOrThrow(
    context.type,
    'structure',
    context.resolveStructuredDriver
  );
  const structuredOptions = options ?? {};
  const prepared = await prepareNativeStructuredExecution(
    context,
    cond,
    messages,
    structuredOptions,
    responseContract,
    execution
  );
  const modelId = resolvePreparedModelId(
    context,
    cond,
    ModelOutputType.Structured,
    prepared
  );

  return await runPreparedExecution({
    driver,
    prepared,
    modelId,
    execution,
    metricContext: context,
    metricsName: {
      call: 'chat_text_calls',
      error: 'chat_text_errors',
    },
    execute: async preparedExecution => {
      const dispatch = context.createNativeStructuredDispatch(
        preparedExecution.route.backendConfig,
        preparedExecution.route.protocol,
        execution
      );

      for (let attempt = 0; ; attempt++) {
        try {
          const response = await dispatch(preparedExecution.request);
          const parsed = parseNativeStructuredOutput(response);
          const validated = llmValidateJsonSchema(
            preparedExecution.request.schema,
            parsed
          );
          return JSON.stringify(validated);
        } catch (error) {
          if (
            !(await driver.shouldRetry?.({
              error,
              attempt,
              options: structuredOptions,
            }))
          ) {
            throw error;
          }
        }
      }
    },
  });
}

export async function prepareNativeEmbeddingExecution(
  context: EmbeddingRuntimeContext,
  cond: ModelConditions,
  input: string | string[],
  options: CopilotEmbeddingOptions = {},
  execution?: CopilotProviderExecution
): Promise<PreparedNativeEmbeddingExecution | null> {
  const values = Array.isArray(input) ? input : [input];
  return await prepareNativeExecutionBase({
    resolveDriver: context.resolveEmbeddingDriver,
    cond,
    outputType: ModelOutputType.Embedding,
    checkParams: context.checkParams,
    selectModel: context.selectModel,
    execution,
    checkInput: {
      embeddings: values,
      options,
    },
    buildPrepared: ({ driver, model, backendConfig, protocol }) =>
      context.buildPreparedNativeEmbeddingExecution(
        protocol,
        backendConfig,
        model.id,
        buildLlmEmbeddingRequest({
          model: model.id,
          inputs: values,
          dimensions: options?.dimensions ?? driver.defaultDimensions,
          taskType: driver.taskType ?? DEFAULT_EMBEDDING_TASK_TYPE,
        }),
        execution
      ),
  });
}

export async function runNativeEmbedding(
  context: EmbeddingRuntimeContext,
  cond: ModelConditions,
  input: string | string[],
  options?: CopilotEmbeddingOptions,
  execution?: CopilotProviderExecution
) {
  const driver = resolveDriverOrThrow(
    context.type,
    ModelOutputType.Embedding,
    context.resolveEmbeddingDriver
  );
  const prepared = await prepareNativeEmbeddingExecution(
    context,
    cond,
    input,
    options,
    execution
  );
  const modelId = resolvePreparedModelId(
    context,
    cond,
    ModelOutputType.Embedding,
    prepared
  );

  return await runPreparedExecution({
    driver,
    prepared,
    modelId,
    execution,
    metricContext: context,
    metricsName: {
      call: 'generate_embedding_calls',
      error: 'generate_embedding_errors',
    },
    execute: async preparedExecution => {
      const response = await context.createNativeEmbeddingDispatch(
        preparedExecution.route.backendConfig,
        preparedExecution.route.protocol,
        execution
      )(preparedExecution.request);
      return response.embeddings;
    },
  });
}

export async function prepareNativeRerankExecution(
  context: RerankRuntimeContext,
  cond: ModelConditions,
  request: CopilotRerankRequest,
  options: CopilotChatOptions = {},
  execution?: CopilotProviderExecution
): Promise<PreparedNativeRerankExecution | null> {
  return await prepareNativeExecutionBase({
    resolveDriver: context.resolveRerankDriver,
    cond,
    outputType: ModelOutputType.Rerank,
    checkParams: context.checkParams,
    selectModel: context.selectModel,
    execution,
    checkInput: {
      messages: [],
      options,
    },
    buildPrepared: ({ model, backendConfig, protocol }) =>
      context.buildPreparedNativeRerankExecution(
        protocol,
        backendConfig,
        model.id,
        buildLlmRerankRequest(model.id, request),
        execution
      ),
  });
}

export async function prepareNativeImageExecution(
  context: ImageRuntimeContext,
  cond: ModelConditions,
  messages: PromptMessage[],
  options: CopilotImageOptions = {},
  execution?: CopilotProviderExecution
): Promise<PreparedNativeImageExecution | null> {
  return await prepareNativeExecutionBase({
    resolveDriver: context.resolveImageDriver,
    cond,
    outputType: ModelOutputType.Image,
    checkParams: context.checkParams,
    selectModel: context.selectModel,
    execution,
    checkInput: {
      messages,
      options,
    },
    buildPrepared: async ({ driver, model, backendConfig, protocol }) => {
      const preparedMessages = driver.prepareMessages
        ? await driver.prepareMessages(messages, backendConfig, options)
        : messages;

      return context.buildPreparedNativeImageExecution(
        protocol,
        backendConfig,
        model.id,
        preparedMessages,
        options,
        execution
      );
    },
  });
}

export async function runNativeRerank(
  context: RerankRuntimeContext,
  cond: ModelConditions,
  request: CopilotRerankRequest,
  options: CopilotChatOptions = {},
  execution?: CopilotProviderExecution
) {
  const driver = resolveDriverOrThrow(
    context.type,
    ModelOutputType.Rerank,
    context.resolveRerankDriver
  );
  const prepared = await prepareNativeRerankExecution(
    context,
    cond,
    request,
    options,
    execution
  );

  const modelId = resolvePreparedModelId(
    context,
    cond,
    ModelOutputType.Rerank,
    prepared
  );

  return await runPreparedExecution({
    driver,
    prepared,
    modelId,
    execution,
    execute: async preparedExecution => {
      const response = await context.createNativeRerankDispatch(
        preparedExecution.route.backendConfig,
        preparedExecution.route.protocol,
        execution
      )(preparedExecution.request);
      return response.scores;
    },
  });
}
