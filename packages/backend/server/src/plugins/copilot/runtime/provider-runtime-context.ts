import type {
  LlmBackendConfig,
  LlmEmbeddingRequest,
  LlmProtocol,
  LlmRerankRequest,
  LlmStructuredRequest,
  LlmStructuredResponse,
} from '../../../native';
import type { ProviderMiddlewareConfig } from '../config';
import type { CopilotProvider } from '../providers/provider';
import type { ProviderModelRuntimeContext } from '../providers/provider-model-runtime';
import {
  createNativeEmbeddingDispatch as inputCreateNativeEmbeddingDispatch,
  createNativeRerankDispatch as inputCreateNativeRerankDispatch,
  createNativeStructuredDispatch as inputCreateNativeStructuredDispatch,
  createPreparedExecutionRuntime,
  type CreatePreparedExecutionRuntimeInput,
  type PreparedExecutionRuntime,
} from '../providers/provider-native-runtime';
import type {
  CopilotProviderExecution,
  EmbeddingProviderDriver,
  ImageProviderDriver,
  PreparedNativeEmbeddingExecution,
  PreparedNativeExecution,
  PreparedNativeImageExecution,
  PreparedNativeRequestOptions,
  PreparedNativeRerankExecution,
  PreparedNativeStructuredExecution,
  ProviderExecutionDrivers,
  ProviderMetricLabels,
  ProviderRuntimeHostSeed,
  RerankProviderDriver,
  StructuredProviderDriver,
} from '../providers/provider-runtime-contract';
import type {
  CopilotChatOptions,
  CopilotEmbeddingOptions,
  CopilotImageOptions,
  CopilotProviderModel,
  CopilotRerankRequest,
  CopilotStructuredOptions,
  ModelAttachmentCapability,
  ModelConditions,
  ModelFullConditions,
  ModelOutputType,
  PromptMessage,
} from '../providers/types';
import type { CopilotToolSet } from '../tools';
import type { RequiredStructuredOutputContract } from './contracts';
import type { ChatRuntimeContext } from './provider-chat-runtime';
import {
  prepareNativeChatExecution,
  runNativeStreamObject,
  runNativeStreamText,
  runNativeText,
} from './provider-chat-runtime';
import type {
  EmbeddingRuntimeContext,
  ImageRuntimeContext,
  RerankRuntimeContext,
  StructuredRuntimeContext,
} from './provider-driver-runtime';
import {
  prepareNativeEmbeddingExecution,
  prepareNativeImageExecution,
  prepareNativeRerankExecution,
  prepareNativeStructuredExecution,
  runNativeEmbedding,
  runNativeRerank,
  runNativeStructured,
} from './provider-driver-runtime';
import type { NativeProviderAdapter } from './tool/native-adapter';

type ProviderRuntimeContextInput = {
  model: ProviderModelRuntimeContext;
  resolveExecutionDrivers: () => ProviderExecutionDrivers | undefined;
  selectModel: (
    cond: ModelFullConditions,
    execution?: CopilotProviderExecution
  ) => CopilotProviderModel;
  metricLabels: (
    model: string,
    labels?: ProviderMetricLabels,
    execution?: CopilotProviderExecution
  ) => ProviderMetricLabels;
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
  getAttachCapability: (
    model: CopilotProviderModel,
    outputType: ModelOutputType
  ) => ModelAttachmentCapability | undefined;
  getActiveProviderMiddleware: (
    execution?: CopilotProviderExecution
  ) => ProviderMiddlewareConfig;
  getTools: (
    options: CopilotChatOptions,
    model: string
  ) => Promise<CopilotToolSet>;
  buildPreparedNativeExecution: (
    options: PreparedNativeRequestOptions
  ) => Promise<PreparedNativeExecution>;
  createPreparedExecutionAdapter: (
    prepared: PreparedNativeExecution
  ) => NativeProviderAdapter;
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
  buildPreparedNativeImageExecution: (
    protocol: LlmProtocol,
    backendConfig: LlmBackendConfig,
    model: string,
    messages: PromptMessage[],
    options?: CopilotImageOptions,
    execution?: CopilotProviderExecution
  ) => PreparedNativeImageExecution;
};

export type ProviderRuntimeHostInput = Omit<
  ProviderRuntimeContextInput,
  | keyof ProviderRuntimeHostSeed
  | 'buildPreparedNativeExecution'
  | 'createPreparedExecutionAdapter'
  | 'buildPreparedNativeStructuredExecution'
  | 'buildPreparedNativeEmbeddingExecution'
  | 'buildPreparedNativeRerankExecution'
  | 'buildPreparedNativeImageExecution'
> &
  ProviderRuntimeHostSeed & {
    preparedExecutionRuntimeInput: CreatePreparedExecutionRuntimeInput;
    createNativeStructuredDispatch: ProviderRuntimeContextInput['createNativeStructuredDispatch'];
    createNativeEmbeddingDispatch: ProviderRuntimeContextInput['createNativeEmbeddingDispatch'];
    createNativeRerankDispatch: ProviderRuntimeContextInput['createNativeRerankDispatch'];
  };

type ProviderRuntimeHostOverride = {
  overrideRuntimeHost?: (
    runtimeHost: ProviderRuntimeContexts
  ) => ProviderRuntimeContexts;
};

const runtimeHosts = new WeakMap<CopilotProvider, ProviderRuntimeContexts>();

export type ProviderRuntimeContexts = {
  model: ProviderModelRuntimeContext;
  chat: ChatRuntimeContext;
  structured: StructuredRuntimeContext;
  embedding: EmbeddingRuntimeContext;
  rerank: RerankRuntimeContext;
  image: ImageRuntimeContext;
  prepare: {
    chat: (
      kind: 'text' | 'streamText' | 'streamObject',
      cond: ModelConditions,
      messages: PromptMessage[],
      options?: CopilotChatOptions,
      execution?: CopilotProviderExecution
    ) => ReturnType<typeof prepareNativeChatExecution>;
    structured: (
      cond: ModelConditions,
      messages: PromptMessage[],
      options?: CopilotStructuredOptions,
      responseContract?: RequiredStructuredOutputContract,
      execution?: CopilotProviderExecution
    ) => ReturnType<typeof prepareNativeStructuredExecution>;
    embedding: (
      cond: ModelConditions,
      input: string | string[],
      options?: CopilotEmbeddingOptions,
      execution?: CopilotProviderExecution
    ) => ReturnType<typeof prepareNativeEmbeddingExecution>;
    rerank: (
      cond: ModelConditions,
      request: CopilotRerankRequest,
      options?: CopilotChatOptions,
      execution?: CopilotProviderExecution
    ) => ReturnType<typeof prepareNativeRerankExecution>;
    image: (
      cond: ModelConditions,
      messages: PromptMessage[],
      options?: CopilotImageOptions,
      execution?: CopilotProviderExecution
    ) => ReturnType<typeof prepareNativeImageExecution>;
  };
  run: {
    text: (
      cond: ModelConditions,
      messages: PromptMessage[],
      options?: CopilotChatOptions,
      execution?: CopilotProviderExecution
    ) => ReturnType<typeof runNativeText>;
    streamText: (
      cond: ModelConditions,
      messages: PromptMessage[],
      options?: CopilotChatOptions,
      execution?: CopilotProviderExecution
    ) => ReturnType<typeof runNativeStreamText>;
    streamObject: (
      cond: ModelConditions,
      messages: PromptMessage[],
      options?: CopilotChatOptions,
      execution?: CopilotProviderExecution
    ) => ReturnType<typeof runNativeStreamObject>;
    structured: (
      cond: ModelConditions,
      messages: PromptMessage[],
      options?: CopilotStructuredOptions,
      responseContract?: RequiredStructuredOutputContract,
      execution?: CopilotProviderExecution
    ) => ReturnType<typeof runNativeStructured>;
    embedding: (
      cond: ModelConditions,
      input: string | string[],
      options?: CopilotEmbeddingOptions,
      execution?: CopilotProviderExecution
    ) => ReturnType<typeof runNativeEmbedding>;
    rerank: (
      cond: ModelConditions,
      request: CopilotRerankRequest,
      options?: CopilotChatOptions,
      execution?: CopilotProviderExecution
    ) => ReturnType<typeof runNativeRerank>;
  };
};

function createProviderRuntimeContexts(
  input: ProviderRuntimeContextInput
): ProviderRuntimeContexts {
  const resolveDriver = <K extends keyof ProviderExecutionDrivers>(
    kind: K
  ): ProviderExecutionDrivers[K] | undefined =>
    input.resolveExecutionDrivers()?.[kind];
  const chatDriver = resolveDriver('chat');

  const chatContext: ChatRuntimeContext = {
    type: input.model.type,
    resolveChatDriver: () => chatDriver,
    selectModel: input.selectModel,
    metricLabels: input.metricLabels,
    createPreparedExecutionAdapter: input.createPreparedExecutionAdapter,
  };

  const structuredContext: StructuredRuntimeContext = {
    type: input.model.type,
    resolveStructuredDriver: () =>
      resolveDriver('structured') as StructuredProviderDriver | undefined,
    checkParams: input.checkParams,
    selectModel: input.selectModel,
    getAttachCapability: input.getAttachCapability,
    getActiveProviderMiddleware: input.getActiveProviderMiddleware,
    buildPreparedNativeStructuredExecution:
      input.buildPreparedNativeStructuredExecution,
    createNativeStructuredDispatch: input.createNativeStructuredDispatch,
    metricLabels: input.metricLabels,
  };

  const embeddingContext: EmbeddingRuntimeContext = {
    type: input.model.type,
    resolveEmbeddingDriver: () =>
      resolveDriver('embedding') as EmbeddingProviderDriver | undefined,
    checkParams: input.checkParams,
    selectModel: input.selectModel,
    buildPreparedNativeEmbeddingExecution:
      input.buildPreparedNativeEmbeddingExecution,
    createNativeEmbeddingDispatch: input.createNativeEmbeddingDispatch,
    metricLabels: input.metricLabels,
  };

  const rerankContext: RerankRuntimeContext = {
    type: input.model.type,
    resolveRerankDriver: () =>
      resolveDriver('rerank') as RerankProviderDriver | undefined,
    checkParams: input.checkParams,
    selectModel: input.selectModel,
    buildPreparedNativeRerankExecution:
      input.buildPreparedNativeRerankExecution,
    createNativeRerankDispatch: input.createNativeRerankDispatch,
  };

  const imageContext: ImageRuntimeContext = {
    type: input.model.type,
    resolveImageDriver: () =>
      resolveDriver('image') as ImageProviderDriver | undefined,
    checkParams: input.checkParams,
    selectModel: input.selectModel,
    buildPreparedNativeImageExecution: input.buildPreparedNativeImageExecution,
  };

  const prepare: ProviderRuntimeContexts['prepare'] = {
    chat: (kind, cond, messages, options = {}, execution) =>
      prepareNativeChatExecution(
        chatContext.resolveChatDriver,
        input.buildPreparedNativeExecution,
        {
          kind,
          cond,
          messages,
          options,
          execution,
        }
      ),
    structured: (cond, messages, options = {}, responseContract, execution) =>
      prepareNativeStructuredExecution(
        structuredContext,
        cond,
        messages,
        options,
        responseContract,
        execution
      ),
    embedding: (cond, values, options = {}, execution) =>
      prepareNativeEmbeddingExecution(
        embeddingContext,
        cond,
        values,
        options,
        execution
      ),
    rerank: (cond, request, options = {}, execution) =>
      prepareNativeRerankExecution(
        rerankContext,
        cond,
        request,
        options,
        execution
      ),
    image: (cond, messages, options = {}, execution) =>
      prepareNativeImageExecution(
        imageContext,
        cond,
        messages,
        options,
        execution
      ),
  };

  return {
    model: input.model,
    chat: chatContext,
    structured: structuredContext,
    embedding: embeddingContext,
    rerank: rerankContext,
    image: imageContext,
    prepare,
    run: {
      text: (cond, messages, options, execution) =>
        runNativeText(
          chatContext,
          prepare.chat,
          cond,
          messages,
          options,
          execution
        ),
      streamText: (cond, messages, options, execution) =>
        runNativeStreamText(
          chatContext,
          prepare.chat,
          cond,
          messages,
          options,
          execution
        ),
      streamObject: (cond, messages, options, execution) =>
        runNativeStreamObject(
          chatContext,
          prepare.chat,
          cond,
          messages,
          options,
          execution
        ),
      structured: (cond, messages, options, responseContract, execution) =>
        runNativeStructured(
          structuredContext,
          cond,
          messages,
          options,
          responseContract,
          execution
        ),
      embedding: (cond, values, options, execution) =>
        runNativeEmbedding(embeddingContext, cond, values, options, execution),
      rerank: (cond, request, options, execution) =>
        runNativeRerank(rerankContext, cond, request, options, execution),
    },
  };
}

export function createProviderRuntimeHost(
  input: ProviderRuntimeHostInput
): ProviderRuntimeContexts {
  const preparedExecutionRuntime: PreparedExecutionRuntime =
    createPreparedExecutionRuntime(input.preparedExecutionRuntimeInput);

  return createProviderRuntimeContexts({
    ...input,
    buildPreparedNativeExecution:
      preparedExecutionRuntime.buildPreparedNativeExecution,
    createPreparedExecutionAdapter:
      preparedExecutionRuntime.createPreparedExecutionAdapter,
    buildPreparedNativeStructuredExecution:
      preparedExecutionRuntime.buildPreparedNativeStructuredExecution,
    buildPreparedNativeEmbeddingExecution:
      preparedExecutionRuntime.buildPreparedNativeEmbeddingExecution,
    buildPreparedNativeRerankExecution:
      preparedExecutionRuntime.buildPreparedNativeRerankExecution,
    buildPreparedNativeImageExecution:
      preparedExecutionRuntime.buildPreparedNativeImageExecution,
    createNativeStructuredDispatch: input.createNativeStructuredDispatch,
    createNativeEmbeddingDispatch: input.createNativeEmbeddingDispatch,
    createNativeRerankDispatch: input.createNativeRerankDispatch,
  });
}

export function getProviderRuntimeHost(
  provider: CopilotProvider
): ProviderRuntimeContexts {
  const existingRuntimeHost = runtimeHosts.get(provider);
  if (existingRuntimeHost) {
    return existingRuntimeHost;
  }
  const runtimeHostSeed = provider.getRuntimeHostSeed();
  const runtimeHost = createProviderRuntimeHost({
    ...runtimeHostSeed,
    preparedExecutionRuntimeInput: {
      resolveProviderId: execution =>
        execution?.providerId ?? `${provider.type}-default`,
      getTools: runtimeHostSeed.getTools,
      getActiveProviderMiddleware: runtimeHostSeed.getActiveProviderMiddleware,
      createNativeAdapter: provider.createNativeAdapter.bind(provider),
      maxSteps: provider.maxSteps,
    },
    createNativeStructuredDispatch: (backendConfig, protocol, _execution) =>
      inputCreateNativeStructuredDispatch(backendConfig, protocol),
    createNativeEmbeddingDispatch: (backendConfig, protocol, _execution) =>
      inputCreateNativeEmbeddingDispatch(backendConfig, protocol),
    createNativeRerankDispatch: (backendConfig, protocol, _execution) =>
      inputCreateNativeRerankDispatch(backendConfig, protocol),
  });
  const resolvedRuntimeHost =
    (provider as ProviderRuntimeHostOverride).overrideRuntimeHost?.(
      runtimeHost
    ) ?? runtimeHost;

  runtimeHosts.set(provider, resolvedRuntimeHost);
  return resolvedRuntimeHost;
}
