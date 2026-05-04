import type {
  LlmBackendConfig,
  LlmEmbeddingRequest,
  LlmProtocol,
  LlmRerankRequest,
  LlmStructuredRequest,
} from '../../../native';
import {
  buildLlmImageRequestFromMessages,
  llmEmbeddingDispatch,
  llmRerankDispatch,
  llmStructuredDispatch,
} from '../../../native';
import type { NodeTextMiddleware, ProviderMiddlewareConfig } from '../config';
import {
  buildToolContracts,
  projectPromptMessageForNative,
} from '../runtime/contracts';
import { buildNativeRequest } from '../runtime/native-request-runtime';
import type { ToolLoopBackend } from '../runtime/tool/bridge';
import type { NativeProviderAdapter } from '../runtime/tool/native-adapter';
import type { CopilotToolSet } from '../tools';
import type {
  CopilotProviderExecution,
  PreparedNativeEmbeddingExecution,
  PreparedNativeExecution,
  PreparedNativeImageExecution,
  PreparedNativeRequestOptions,
  PreparedNativeRerankExecution,
  PreparedNativeStructuredExecution,
} from './provider-runtime-contract';
import type {
  CopilotChatOptions,
  CopilotImageOptions,
  PromptMessage,
} from './types';

export type CreateToolAdapterOptions = {
  maxSteps?: number;
  nodeTextMiddleware?: NodeTextMiddleware[];
};

export type CreateNativeAdapter = (
  backend: ToolLoopBackend,
  tools: CopilotToolSet,
  nodeTextMiddleware?: NodeTextMiddleware[],
  options?: CreateToolAdapterOptions
) => NativeProviderAdapter;

export type CreatePreparedExecutionRuntimeInput = {
  resolveProviderId: (execution?: CopilotProviderExecution) => string;
  getTools: (
    options: CopilotChatOptions,
    model: string
  ) => Promise<CopilotToolSet>;
  getActiveProviderMiddleware: (
    execution?: CopilotProviderExecution
  ) => ProviderMiddlewareConfig;
  createNativeAdapter: CreateNativeAdapter;
  maxSteps: number;
};
export type PreparedExecutionRuntime = ReturnType<
  typeof createPreparedExecutionRuntime
>;

export function createPreparedExecutionRuntime(
  input: CreatePreparedExecutionRuntimeInput
) {
  return {
    buildPreparedNativeExecution: async (
      prepared: PreparedNativeRequestOptions
    ) =>
      await buildPreparedNativeExecution(
        input.resolveProviderId(prepared.execution),
        input.getTools,
        input.getActiveProviderMiddleware,
        input.maxSteps,
        prepared
      ),
    createPreparedExecutionAdapter: (prepared: PreparedNativeExecution) =>
      createPreparedExecutionAdapter(
        input.createNativeAdapter,
        input.maxSteps,
        prepared
      ),
    buildPreparedNativeStructuredExecution: (
      protocol: LlmProtocol,
      backendConfig: LlmBackendConfig,
      model: string,
      request: LlmStructuredRequest,
      execution?: CopilotProviderExecution
    ) =>
      buildPreparedNativeStructuredExecution(
        input.resolveProviderId(execution),
        protocol,
        backendConfig,
        model,
        request
      ),
    buildPreparedNativeEmbeddingExecution: (
      protocol: LlmProtocol,
      backendConfig: LlmBackendConfig,
      model: string,
      request: LlmEmbeddingRequest,
      execution?: CopilotProviderExecution
    ) =>
      buildPreparedNativeEmbeddingExecution(
        input.resolveProviderId(execution),
        protocol,
        backendConfig,
        model,
        request
      ),
    buildPreparedNativeRerankExecution: (
      protocol: LlmProtocol,
      backendConfig: LlmBackendConfig,
      model: string,
      request: LlmRerankRequest,
      execution?: CopilotProviderExecution
    ) =>
      buildPreparedNativeRerankExecution(
        input.resolveProviderId(execution),
        protocol,
        backendConfig,
        model,
        request
      ),
    buildPreparedNativeImageExecution: (
      protocol: LlmProtocol,
      backendConfig: LlmBackendConfig,
      model: string,
      messages: PromptMessage[],
      options: CopilotImageOptions = {},
      execution?: CopilotProviderExecution
    ) =>
      buildPreparedNativeImageExecution(
        input.resolveProviderId(execution),
        protocol,
        backendConfig,
        model,
        messages,
        options
      ),
  };
}

export function createPreparedExecutionAdapter(
  createNativeAdapter: CreateNativeAdapter,
  maxSteps: number,
  prepared: PreparedNativeExecution
) {
  return createNativeAdapter(
    {
      protocol: prepared.route.protocol,
      backendConfig: prepared.route.backendConfig,
    },
    prepared.tools,
    prepared.postprocess?.nodeTextMiddleware,
    {
      maxSteps,
      nodeTextMiddleware: prepared.postprocess?.nodeTextMiddleware,
    }
  );
}

export function createNativeStructuredDispatch(
  backendConfig: LlmBackendConfig,
  protocol: LlmProtocol
) {
  return (request: LlmStructuredRequest) =>
    llmStructuredDispatch(protocol, backendConfig, request);
}

export function createNativeEmbeddingDispatch(
  backendConfig: LlmBackendConfig,
  protocol: LlmProtocol
) {
  return (request: LlmEmbeddingRequest) =>
    llmEmbeddingDispatch(protocol, backendConfig, request);
}

export function createNativeRerankDispatch(
  backendConfig: LlmBackendConfig,
  protocol: LlmProtocol
) {
  return (request: LlmRerankRequest) =>
    llmRerankDispatch(protocol, backendConfig, request);
}

function buildPreparedRoute(
  providerId: string,
  protocol: LlmProtocol,
  backendConfig: LlmBackendConfig,
  model: string
): PreparedNativeExecution['route'] {
  return {
    providerId,
    protocol,
    requestLayer: backendConfig.request_layer,
    model,
    backendConfig,
  };
}

export async function buildPreparedNativeExecution(
  providerId: string,
  getTools: (
    options: CopilotChatOptions,
    model: string
  ) => Promise<CopilotToolSet>,
  getActiveProviderMiddleware: (
    execution?: CopilotProviderExecution
  ) => ProviderMiddlewareConfig,
  maxSteps: number,
  {
    protocol,
    backendConfig,
    model,
    messages,
    options = {},
    execution,
    withAttachment = true,
    attachmentCapability,
    include,
    reasoning,
    tools,
    middleware,
  }: PreparedNativeRequestOptions
): Promise<PreparedNativeExecution> {
  const resolvedTools = tools ?? (await getTools(options, model));
  const resolvedMiddleware =
    middleware ?? getActiveProviderMiddleware(execution);
  const { request } = await buildNativeRequest({
    model,
    messages,
    options,
    toolContracts: buildToolContracts(resolvedTools),
    withAttachment,
    attachmentCapability,
    include,
    reasoning,
    middleware: resolvedMiddleware,
  });

  return {
    route: buildPreparedRoute(providerId, protocol, backendConfig, model),
    request,
    tools: resolvedTools,
    maxSteps,
    postprocess: {
      nodeTextMiddleware: resolvedMiddleware.node?.text,
    },
  };
}

type BuildPreparedNativeDispatchExecution = <
  TRequest extends
    | LlmStructuredRequest
    | LlmEmbeddingRequest
    | LlmRerankRequest,
>(
  providerId: string,
  protocol: LlmProtocol,
  backendConfig: LlmBackendConfig,
  model: string,
  request: TRequest
) => {
  route: PreparedNativeExecution['route'];
  request: TRequest;
};

const buildPreparedNativeDispatchExecution: BuildPreparedNativeDispatchExecution =
  (providerId, protocol, backendConfig, model, request) => {
    return {
      route: buildPreparedRoute(providerId, protocol, backendConfig, model),
      request,
    };
  };

export const buildPreparedNativeStructuredExecution =
  buildPreparedNativeDispatchExecution as (
    providerId: string,
    protocol: LlmProtocol,
    backendConfig: LlmBackendConfig,
    model: string,
    request: LlmStructuredRequest
  ) => PreparedNativeStructuredExecution;

export const buildPreparedNativeEmbeddingExecution =
  buildPreparedNativeDispatchExecution as (
    providerId: string,
    protocol: LlmProtocol,
    backendConfig: LlmBackendConfig,
    model: string,
    request: LlmEmbeddingRequest
  ) => PreparedNativeEmbeddingExecution;

export const buildPreparedNativeRerankExecution =
  buildPreparedNativeDispatchExecution as (
    providerId: string,
    protocol: LlmProtocol,
    backendConfig: LlmBackendConfig,
    model: string,
    request: LlmRerankRequest
  ) => PreparedNativeRerankExecution;

export function buildPreparedNativeImageExecution(
  providerId: string,
  protocol: LlmProtocol,
  backendConfig: LlmBackendConfig,
  model: string,
  messages: PromptMessage[],
  options: CopilotImageOptions = {}
): PreparedNativeImageExecution {
  const nativeMessages = messages.map(
    message => projectPromptMessageForNative(message).message
  );

  return {
    route: buildPreparedRoute(providerId, protocol, backendConfig, model),
    request: buildLlmImageRequestFromMessages({
      model,
      protocol,
      messages: nativeMessages,
      options: projectImageRequestOptions(options),
    }),
  };
}

function projectImageRequestOptions(options: CopilotImageOptions = {}) {
  return {
    quality: options.quality,
    seed: options.seed,
    modelName: options.modelName,
    loras: options.loras,
  };
}
