import type {
  LlmBackendConfig,
  LlmEmbeddingRequest,
  LlmImageRequest,
  LlmProtocol,
  LlmRequest,
  LlmRerankRequest,
  LlmStructuredRequest,
} from '../../../native';
import type { NodeTextMiddleware, ProviderMiddlewareConfig } from '../config';
import type { CopilotToolSet } from '../tools';
import {
  type ProviderModelRuntimeContext,
  resolveProviderModelRoute,
} from './provider-model-runtime';
import type { NormalizedCopilotProviderProfile } from './provider-registry';
import {
  CopilotChatOptions,
  CopilotImageOptions,
  CopilotProviderModel,
  CopilotStructuredOptions,
  ModelAttachmentCapability,
  ModelConditions,
  ModelFullConditions,
  ModelOutputType,
  PromptMessage,
} from './types';

export type NativeExecutionRoute = {
  protocol: LlmProtocol;
  requestLayer?: LlmBackendConfig['request_layer'];
  model: string;
  backendConfig: LlmBackendConfig;
};

export type CopilotProviderExecution = {
  providerId: string;
  profile: NormalizedCopilotProviderProfile;
};

export type PreparedNativeExecution = {
  route: NativeExecutionRoute & {
    providerId: string;
  };
  request: LlmRequest;
  tools: CopilotToolSet;
  maxSteps?: number;
  postprocess?: {
    nodeTextMiddleware?: NodeTextMiddleware[];
  };
};

export type PreparedNativeStructuredExecution = {
  route: NativeExecutionRoute & {
    providerId: string;
  };
  request: LlmStructuredRequest;
};

export type PreparedNativeEmbeddingExecution = {
  route: NativeExecutionRoute & {
    providerId: string;
  };
  request: LlmEmbeddingRequest;
};

export type PreparedNativeRerankExecution = {
  route: NativeExecutionRoute & {
    providerId: string;
  };
  request: LlmRerankRequest;
};

export type PreparedNativeImageExecution = {
  route: NativeExecutionRoute & {
    providerId: string;
  };
  request: LlmImageRequest;
};

export type PreparedNativeRequestOptions = {
  protocol: LlmProtocol;
  backendConfig: LlmBackendConfig;
  model: string;
  messages: PromptMessage[];
  options?: CopilotChatOptions;
  execution?: CopilotProviderExecution;
  withAttachment?: boolean;
  attachmentCapability?: ModelAttachmentCapability;
  include?: string[];
  reasoning?: Record<string, unknown>;
  tools?: CopilotToolSet;
  middleware?: ProviderMiddlewareConfig;
};

type ProviderChatDriverPrepareResult = Omit<
  PreparedNativeRequestOptions,
  'execution' | 'options'
>;

type Awaitable<T> = T | Promise<T>;

type NativeBackendConfigResolver = (
  execution?: CopilotProviderExecution
) => Awaitable<LlmBackendConfig>;

export type StructuredProviderDriver = {
  createBackendConfig: NativeBackendConfigResolver;
  prepareMessages?: (
    messages: PromptMessage[],
    backendConfig: LlmBackendConfig,
    options: NonNullable<CopilotStructuredOptions>
  ) => Promise<PromptMessage[]>;
  shouldRetry?: (context: {
    error: unknown;
    attempt: number;
    options: NonNullable<CopilotStructuredOptions>;
  }) => Awaitable<boolean>;
  mapError: (error: unknown) => unknown;
};

export type EmbeddingProviderDriver = {
  createBackendConfig: NativeBackendConfigResolver;
  defaultDimensions?: number;
  taskType?: string;
  mapError: (error: unknown) => unknown;
};

export type RerankProviderDriver = {
  createBackendConfig: NativeBackendConfigResolver;
  mapError: (error: unknown) => unknown;
};

export type ImageProviderDriver = {
  createBackendConfig: NativeBackendConfigResolver;
  prepareMessages?: (
    messages: PromptMessage[],
    backendConfig: LlmBackendConfig,
    options: NonNullable<CopilotImageOptions>
  ) => Promise<PromptMessage[]>;
  mapError: (error: unknown) => unknown;
};

export type ProviderMetricLabels = Record<
  string,
  string | number | boolean | undefined
>;

export type ProviderExecutionDrivers = {
  chat?: ProviderChatDriver;
  structured?: StructuredProviderDriver;
  embedding?: EmbeddingProviderDriver;
  rerank?: RerankProviderDriver;
  image?: ImageProviderDriver;
};

export type ProviderDriverSpec = NativeProviderDriverBase & {
  chat?: NativeChatDriverOverrides | false;
  structured?: NativeStructuredDriverOverrides | false;
  embedding?: NativeEmbeddingDriverOverrides | false;
  rerank?: NativeRerankDriverOverrides | false;
  image?: NativeImageDriverOverrides | false;
};

export type ProviderRuntimeHostSeed = {
  model: ProviderModelRuntimeContext;
  resolveExecutionDrivers: () => ProviderExecutionDrivers | undefined;
  selectModel: NativeChatDriverBase['selectModel'];
  checkParams: NativeChatDriverBase['checkParams'];
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
  metricLabels: (
    model: string,
    labels?: ProviderMetricLabels,
    execution?: CopilotProviderExecution
  ) => ProviderMetricLabels;
};

export type ProviderChatDriverPrepareInput = {
  kind: 'text' | 'streamText' | 'streamObject';
  cond: ModelConditions;
  messages: PromptMessage[];
  options: CopilotChatOptions;
  execution?: CopilotProviderExecution;
};

export type ProviderChatDriver = {
  prepare: (input: {
    kind: ProviderChatDriverPrepareInput['kind'];
    cond: ProviderChatDriverPrepareInput['cond'];
    messages: ProviderChatDriverPrepareInput['messages'];
    options: ProviderChatDriverPrepareInput['options'];
    execution?: ProviderChatDriverPrepareInput['execution'];
  }) => Promise<ProviderChatDriverPrepareResult | null>;
  mapError: (error: unknown) => unknown;
};

type NativeProviderDriverBase = Pick<
  StructuredProviderDriver,
  'createBackendConfig' | 'mapError'
>;

type ChatToolingResult = Pick<
  ProviderChatDriverPrepareResult,
  'tools' | 'middleware'
>;

type NativeChatDriverBase = NativeProviderDriverBase & {
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
  getTools?: (
    options: CopilotChatOptions,
    model: string
  ) => Promise<CopilotToolSet>;
  getActiveProviderMiddleware?: (
    execution?: CopilotProviderExecution
  ) => ProviderMiddlewareConfig;
};

type NativeStructuredDriverOverrides = Partial<StructuredProviderDriver>;
type NativeEmbeddingDriverOverrides = Partial<EmbeddingProviderDriver>;
type NativeRerankDriverOverrides = Partial<RerankProviderDriver>;
type NativeImageDriverOverrides = Partial<ImageProviderDriver>;

type NativeChatDriverContext = {
  input: ProviderChatDriverPrepareInput;
  outputType: ModelOutputType;
  normalizedCond: ModelFullConditions;
  model: CopilotProviderModel;
  backendConfig: LlmBackendConfig;
  protocol: LlmProtocol;
  messages: PromptMessage[];
  options: NonNullable<CopilotChatOptions>;
  execution?: CopilotProviderExecution;
};

type NativeChatDriverOverrides = {
  resolveOutputType?: (
    kind: ProviderChatDriverPrepareInput['kind']
  ) => ModelOutputType | null;
  withAttachment?: boolean;
  prepareMessages?: (
    context: Omit<NativeChatDriverContext, 'messages'>
  ) => Awaitable<PromptMessage[]>;
  resolveTooling?: (
    context: NativeChatDriverContext
  ) => Awaitable<ChatToolingResult>;
  resolveRequestOptions?: (
    context: NativeChatDriverContext
  ) => Awaitable<
    Partial<
      Pick<
        ProviderChatDriverPrepareResult,
        'withAttachment' | 'attachmentCapability' | 'include' | 'reasoning'
      >
    >
  >;
};

export function createNativeProviderDriverFactory(
  base: NativeProviderDriverBase
) {
  return {
    structured(
      overrides: NativeStructuredDriverOverrides = {}
    ): StructuredProviderDriver {
      return {
        createBackendConfig:
          overrides.createBackendConfig ?? base.createBackendConfig,
        mapError: overrides.mapError ?? base.mapError,
        ...(overrides.prepareMessages
          ? { prepareMessages: overrides.prepareMessages }
          : {}),
        ...(overrides.shouldRetry
          ? { shouldRetry: overrides.shouldRetry }
          : {}),
      };
    },
    embedding(
      overrides: NativeEmbeddingDriverOverrides = {}
    ): EmbeddingProviderDriver {
      return {
        createBackendConfig:
          overrides.createBackendConfig ?? base.createBackendConfig,
        mapError: overrides.mapError ?? base.mapError,
        ...(overrides.defaultDimensions !== undefined
          ? { defaultDimensions: overrides.defaultDimensions }
          : {}),
        ...(overrides.taskType ? { taskType: overrides.taskType } : {}),
      };
    },
    rerank(overrides: NativeRerankDriverOverrides = {}): RerankProviderDriver {
      return {
        createBackendConfig:
          overrides.createBackendConfig ?? base.createBackendConfig,
        mapError: overrides.mapError ?? base.mapError,
      };
    },
    image(overrides: NativeImageDriverOverrides = {}): ImageProviderDriver {
      return {
        createBackendConfig:
          overrides.createBackendConfig ?? base.createBackendConfig,
        mapError: overrides.mapError ?? base.mapError,
        ...(overrides.prepareMessages
          ? { prepareMessages: overrides.prepareMessages }
          : {}),
      };
    },
  };
}

function compileProviderChatDriver(
  spec: NativeProviderDriverBase & NativeChatDriverOverrides,
  base: NativeChatDriverBase
): ProviderChatDriver {
  return {
    prepare: async (input: ProviderChatDriverPrepareInput) => {
      const options: NonNullable<CopilotChatOptions> = input.options ?? {};
      const resolvedOutputType = spec.resolveOutputType?.(input.kind);
      const outputType =
        resolvedOutputType === undefined
          ? input.kind === 'streamObject'
            ? ModelOutputType.Object
            : ModelOutputType.Text
          : resolvedOutputType;
      if (!outputType) {
        return null;
      }

      const normalizedCond = await base.checkParams({
        messages: input.messages,
        cond: {
          ...input.cond,
          outputType,
        },
        options,
        execution: input.execution,
        ...(spec.withAttachment !== undefined
          ? { withAttachment: spec.withAttachment }
          : {}),
      });
      const model = base.selectModel(normalizedCond, input.execution);
      const backendConfig = await spec.createBackendConfig(input.execution);
      const route = resolveProviderModelRoute(model, outputType);
      if (!route.protocol) {
        throw new Error(`Missing native protocol for model ${model.id}`);
      }
      const partialContext = {
        input,
        outputType,
        normalizedCond,
        model,
        backendConfig:
          route.requestLayer === backendConfig.request_layer
            ? backendConfig
            : { ...backendConfig, request_layer: route.requestLayer },
        protocol: route.protocol,
        options,
        execution: input.execution,
      };
      const messages = spec.prepareMessages
        ? await spec.prepareMessages(partialContext)
        : input.messages;
      const context = {
        ...partialContext,
        messages,
      };
      const tooling = spec.resolveTooling
        ? await spec.resolveTooling(context)
        : {
            ...(base.getTools
              ? { tools: await base.getTools(options, model.id) }
              : {}),
            ...(base.getActiveProviderMiddleware
              ? {
                  middleware: base.getActiveProviderMiddleware(input.execution),
                }
              : {}),
          };
      const requestOptions = spec.resolveRequestOptions
        ? await spec.resolveRequestOptions(context)
        : {};

      return {
        protocol: context.protocol,
        backendConfig: context.backendConfig,
        model: model.id,
        messages,
        ...(spec.withAttachment === false ? { withAttachment: false } : {}),
        ...requestOptions,
        ...tooling,
      };
    },
    mapError: spec.mapError,
  };
}

export function createNativeExecutionDriverSpec(
  input: ProviderDriverSpec,
  runtimeBase: NativeChatDriverBase
): ProviderExecutionDrivers {
  const driverBase = {
    createBackendConfig: input.createBackendConfig,
    mapError: input.mapError,
  };
  const nativeDrivers = createNativeProviderDriverFactory(driverBase);

  return {
    ...(input.chat !== false
      ? {
          chat: compileProviderChatDriver(
            { ...driverBase, ...input.chat },
            runtimeBase
          ),
        }
      : {}),
    ...(input.structured !== false
      ? {
          structured: nativeDrivers.structured(input.structured ?? undefined),
        }
      : {}),
    ...(input.embedding !== false
      ? {
          embedding: nativeDrivers.embedding(input.embedding ?? undefined),
        }
      : {}),
    ...(input.rerank !== false
      ? { rerank: nativeDrivers.rerank(input.rerank ?? undefined) }
      : {}),
    ...(input.image !== false
      ? { image: nativeDrivers.image(input.image ?? undefined) }
      : {}),
  };
}
