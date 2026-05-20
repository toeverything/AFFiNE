import { Injectable } from '@nestjs/common';

import type {
  LlmPreparedDispatchRoute,
  LlmPreparedEmbeddingDispatchRoute,
  LlmPreparedImageDispatchRoute,
  LlmPreparedRerankDispatchRoute,
  LlmPreparedStructuredDispatchRoute,
} from '../../../native';
import { llmNormalizePreparedRoutes } from '../../../native';
import {
  CopilotProviderFactory,
  type ResolvedCopilotProvider,
} from '../providers/factory';
import type {
  PreparedNativeEmbeddingExecution,
  PreparedNativeExecution,
  PreparedNativeImageExecution,
  PreparedNativeRerankExecution,
  PreparedNativeStructuredExecution,
} from '../providers/provider-runtime-contract';
import type {
  CopilotChatOptions,
  CopilotEmbeddingOptions,
  CopilotImageOptions,
  CopilotProviderType,
  CopilotRerankRequest,
  CopilotStructuredOptions,
  ModelConditions,
  PromptMessage,
} from '../providers/types';
import { ModelOutputType } from '../providers/types';
import type { RequiredStructuredOutputContract } from './contracts';
import {
  type ExecutionRequestKind,
  type ExecutionRoute,
  type ExecutionTransportContract,
  parseExecutionPlan,
  type SerializableExecutionPlan,
  type SerializableExecutionPlanRequest,
} from './contracts/execution-plan-contract';
import { CopilotExecutionMetrics } from './execution-metrics';

export type { ExecutionRequestKind };

type ProviderFilter = {
  prefer?: CopilotProviderType;
};

type BaseExecutionRequest<TKind extends ExecutionRequestKind> = {
  kind: TKind;
  cond: ModelConditions;
};

type TextExecutionRequest = BaseExecutionRequest<'text'> & {
  messages: PromptMessage[];
  options?: CopilotChatOptions;
};

type StreamTextExecutionRequest = BaseExecutionRequest<'streamText'> & {
  messages: PromptMessage[];
  options?: CopilotChatOptions;
};

type StreamObjectExecutionRequest = BaseExecutionRequest<'streamObject'> & {
  messages: PromptMessage[];
  options?: CopilotChatOptions;
};

type StructuredExecutionRequest = BaseExecutionRequest<'structured'> & {
  messages: PromptMessage[];
  options?: CopilotStructuredOptions;
};

type ImageExecutionRequest = BaseExecutionRequest<'image'> & {
  messages: PromptMessage[];
  options?: CopilotImageOptions;
};

type EmbeddingExecutionRequest = BaseExecutionRequest<'embedding'> & {
  modelId: string;
  input: string | string[];
  options?: CopilotEmbeddingOptions;
};

type RerankExecutionRequest = BaseExecutionRequest<'rerank'> & {
  modelId: string;
  request: CopilotRerankRequest;
  options?: CopilotChatOptions;
};

export type ExecutionPlanRequest =
  | TextExecutionRequest
  | StreamTextExecutionRequest
  | StreamObjectExecutionRequest
  | StructuredExecutionRequest
  | ImageExecutionRequest
  | EmbeddingExecutionRequest
  | RerankExecutionRequest;

export type ExecutionPlanForKind<TKind extends ExecutionRequestKind> =
  ExecutionPlan & {
    request: Extract<ExecutionPlanRequest, { kind: TKind }>;
  };

type NativePreparedDispatchPlan<TRoute, TPrepared> = {
  routes: TRoute[];
  prepared: TPrepared;
};

export type NativeChatDispatchPlan = NativePreparedDispatchPlan<
  LlmPreparedDispatchRoute,
  PreparedNativeExecution
> & {
  hasTools: boolean;
};

export type NativeStructuredDispatchPlan = NativePreparedDispatchPlan<
  LlmPreparedStructuredDispatchRoute,
  PreparedNativeStructuredExecution
>;

export type NativeEmbeddingDispatchPlan = NativePreparedDispatchPlan<
  LlmPreparedEmbeddingDispatchRoute,
  PreparedNativeEmbeddingExecution
>;

export type NativeRerankDispatchPlan = NativePreparedDispatchPlan<
  LlmPreparedRerankDispatchRoute,
  PreparedNativeRerankExecution
>;

export type NativeImageDispatchPlan = NativePreparedDispatchPlan<
  LlmPreparedImageDispatchRoute,
  PreparedNativeImageExecution
>;

export type ExecutionPlan = {
  nativeDispatch?: {
    chat?: NativeChatDispatchPlan;
    structured?: NativeStructuredDispatchPlan;
    embedding?: NativeEmbeddingDispatchPlan;
    rerank?: NativeRerankDispatchPlan;
    image?: NativeImageDispatchPlan;
  };
  serializable?: SerializableExecutionPlan;
  transport?: ExecutionTransportContract;
  request: ExecutionPlanRequest;
  routePolicy: { fallbackOrder: string[] };
  runtimePolicy: {
    prefer?: CopilotProviderType;
  };
  attachmentPolicy: {
    materializeRemoteAttachments: boolean;
  };
  responsePostprocess: { mode: ExecutionRequestKind };
  hostPersistence: {
    persistAssistantTurn: boolean;
    outputKind: ExecutionRequestKind;
  };
  hostContext: {
    signal?: AbortSignal;
    currentMessages?: PromptMessage[];
  };
};

type PreparedRouteLike<TRequest = unknown> = {
  route: {
    providerId: string;
    protocol: PreparedNativeExecution['route']['protocol'];
    model: string;
    backendConfig: PreparedNativeExecution['route']['backendConfig'];
  };
  request: TRequest;
};

function buildPreparedTransport<
  TKind extends ExecutionTransportContract['kind'],
  TPrepared extends PreparedRouteLike,
>(
  kind: TKind,
  routes: ResolvedCopilotProvider[],
  getPrepared: (route: ResolvedCopilotProvider) => TPrepared | undefined
): ExecutionTransportContract | undefined {
  const prepared =
    routes.length === 1 ? routes[0] && getPrepared(routes[0]) : undefined;
  if (!prepared) {
    return;
  }

  return {
    kind,
    request: prepared.request,
  } as ExecutionTransportContract;
}

function collectPreparedRoutes<TPrepared extends PreparedRouteLike, TRoute>(
  routes: ResolvedCopilotProvider[],
  getPrepared: (route: ResolvedCopilotProvider) => TPrepared | undefined,
  mapPreparedRoute: (prepared: TPrepared) => TRoute
): TRoute[] | undefined {
  if (!routes.length) {
    return;
  }

  const preparedRoutes: TRoute[] = [];
  for (const route of routes) {
    const prepared = getPrepared(route);
    if (!prepared) {
      return;
    }
    preparedRoutes.push(mapPreparedRoute(prepared));
  }

  return preparedRoutes;
}

function buildPreparedDispatchPlan<
  TPrepared extends PreparedRouteLike,
  TRoute,
  TDispatch extends NativePreparedDispatchPlan<TRoute, TPrepared>,
>(
  routes: ResolvedCopilotProvider[],
  getPrepared: (route: ResolvedCopilotProvider) => TPrepared | undefined,
  mapPreparedRoute: (prepared: TPrepared) => TRoute,
  buildPreparedDispatchResult?: (
    preparedRoutes: TRoute[],
    prepared: TPrepared
  ) => TDispatch
): TDispatch | undefined {
  const preparedRoutes = collectPreparedRoutes(
    routes,
    getPrepared,
    mapPreparedRoute
  );
  const prepared = routes[0] && getPrepared(routes[0]);
  if (!preparedRoutes || !prepared) {
    return;
  }

  const normalizedRoutes = llmNormalizePreparedRoutes<TRoute[]>(preparedRoutes);

  return buildPreparedDispatchResult
    ? buildPreparedDispatchResult(normalizedRoutes, prepared)
    : ({ routes: normalizedRoutes, prepared } as TDispatch);
}

type DispatchPreparedRoute<TRequest> = {
  provider_id: string;
  protocol: PreparedNativeExecution['route']['protocol'];
  model: string;
  config: PreparedNativeExecution['route']['backendConfig'];
  request: TRequest;
};

function mapPreparedDispatchRoute<TRequest>(
  prepared: PreparedRouteLike<TRequest>
): DispatchPreparedRoute<TRequest> {
  return {
    provider_id: prepared.route.providerId,
    protocol: prepared.route.protocol,
    model: prepared.route.model,
    config: prepared.route.backendConfig,
    request: prepared.request,
  };
}

type PreparedExecutionArtifactSpec<
  TKind extends ExecutionTransportContract['kind'],
  TPrepared extends PreparedRouteLike,
  TRoute,
  TDispatch extends NativePreparedDispatchPlan<TRoute, TPrepared>,
> = {
  transportKind: TKind;
  getPrepared: (route: ResolvedCopilotProvider) => TPrepared | undefined;
  mapPreparedRoute: (prepared: TPrepared) => TRoute;
  buildPreparedDispatch?: (
    preparedRoutes: TRoute[],
    prepared: TPrepared
  ) => TDispatch;
};

type PreparedExecutionArtifacts<TDispatch> = {
  dispatch?: TDispatch;
  transport?: ExecutionTransportContract;
};

function buildPreparedExecutionArtifacts<
  TKind extends ExecutionTransportContract['kind'],
  TPrepared extends PreparedRouteLike,
  TRoute,
  TDispatch extends NativePreparedDispatchPlan<TRoute, TPrepared>,
>(
  routes: ResolvedCopilotProvider[],
  spec: PreparedExecutionArtifactSpec<TKind, TPrepared, TRoute, TDispatch>
): PreparedExecutionArtifacts<TDispatch> {
  return {
    dispatch: buildPreparedDispatchPlan(
      routes,
      spec.getPrepared,
      spec.mapPreparedRoute,
      spec.buildPreparedDispatch
    ),
    transport: buildPreparedTransport(
      spec.transportKind,
      routes,
      spec.getPrepared
    ),
  };
}

const chatArtifactSpec: PreparedExecutionArtifactSpec<
  'chat',
  PreparedNativeExecution,
  LlmPreparedDispatchRoute,
  NativeChatDispatchPlan
> = {
  transportKind: 'chat',
  getPrepared: route => route.prepared,
  mapPreparedRoute: mapPreparedDispatchRoute,
  buildPreparedDispatch: (preparedRoutes, prepared) => ({
    routes: preparedRoutes,
    prepared,
    hasTools: Object.keys(prepared.tools).length > 0,
  }),
};

const structuredArtifactSpec: PreparedExecutionArtifactSpec<
  'structured',
  PreparedNativeStructuredExecution,
  LlmPreparedStructuredDispatchRoute,
  NativeStructuredDispatchPlan
> = {
  transportKind: 'structured',
  getPrepared: route => route.preparedStructured,
  mapPreparedRoute: mapPreparedDispatchRoute,
};

const embeddingArtifactSpec: PreparedExecutionArtifactSpec<
  'embedding',
  PreparedNativeEmbeddingExecution,
  LlmPreparedEmbeddingDispatchRoute,
  NativeEmbeddingDispatchPlan
> = {
  transportKind: 'embedding',
  getPrepared: route => route.preparedEmbedding,
  mapPreparedRoute: mapPreparedDispatchRoute,
};

const rerankArtifactSpec: PreparedExecutionArtifactSpec<
  'rerank',
  PreparedNativeRerankExecution,
  LlmPreparedRerankDispatchRoute,
  NativeRerankDispatchPlan
> = {
  transportKind: 'rerank',
  getPrepared: route => route.preparedRerank,
  mapPreparedRoute: mapPreparedDispatchRoute,
};

const imageArtifactSpec: PreparedExecutionArtifactSpec<
  'image',
  PreparedNativeImageExecution,
  LlmPreparedImageDispatchRoute,
  NativeImageDispatchPlan
> = {
  transportKind: 'image',
  getPrepared: route => route.preparedImage,
  mapPreparedRoute: mapPreparedDispatchRoute,
};

function buildFallbackOrder(routes: ResolvedCopilotProvider[]) {
  return routes.map(route => route.providerId);
}

function mapExecutionRoute(route: ResolvedCopilotProvider): ExecutionRoute {
  const preparedRoute =
    route.prepared?.route ??
    route.preparedStructured?.route ??
    route.preparedEmbedding?.route ??
    route.preparedRerank?.route ??
    route.preparedImage?.route;

  if (preparedRoute) {
    return {
      providerId: preparedRoute.providerId,
      protocol: preparedRoute.protocol,
      model: preparedRoute.model,
      backendConfig: preparedRoute.backendConfig,
    };
  }

  const rawRoute = route as unknown as ExecutionRoute;
  return {
    providerId: rawRoute.providerId,
    protocol: rawRoute.protocol,
    model: rawRoute.model,
    backendConfig: rawRoute.backendConfig,
  };
}

function stripHostOnlyOptions<TOptions extends object | undefined>(
  options: TOptions
): Record<string, unknown> | undefined {
  if (!options) {
    return;
  }

  const {
    signal: _signal,
    user: _user,
    session: _session,
    workspace: _workspace,
    quotaBackedRoutesAllowed: _quotaBackedRoutesAllowed,
    ...serializable
  } = options as Record<string, unknown>;

  return Object.keys(serializable).length ? serializable : undefined;
}

function buildSerializableRequest(
  request: ExecutionPlanRequest
): SerializableExecutionPlanRequest {
  switch (request.kind) {
    case 'text':
    case 'streamText':
    case 'streamObject':
    case 'structured':
    case 'image':
      return {
        ...request,
        options: stripHostOnlyOptions(request.options),
      } as SerializableExecutionPlanRequest;
    case 'embedding':
    case 'rerank':
      return {
        ...request,
        options: stripHostOnlyOptions(request.options),
      };
  }
}

function buildSerializableExecutionPlan(
  routes: ResolvedCopilotProvider[],
  input: Omit<
    ExecutionPlan,
    'nativeDispatch' | 'serializable' | 'hostContext'
  > &
    Pick<ExecutionPlan, 'hostContext'>
): SerializableExecutionPlan {
  return parseExecutionPlan({
    routes: routes.map(mapExecutionRoute),
    request: buildSerializableRequest(input.request),
    transport: input.transport,
    routePolicy: input.routePolicy,
    runtimePolicy: input.runtimePolicy,
    attachmentPolicy: input.attachmentPolicy,
    responsePostprocess: input.responsePostprocess,
    hostContext: input.hostContext.currentMessages
      ? { currentMessages: input.hostContext.currentMessages }
      : undefined,
  });
}

type MessagePlanArtifacts = Pick<ExecutionPlan, 'nativeDispatch' | 'transport'>;

function buildMessagePlanArtifacts(
  kind: Extract<
    ExecutionRequestKind,
    'text' | 'streamText' | 'streamObject' | 'structured' | 'image'
  >,
  routes: ResolvedCopilotProvider[]
): MessagePlanArtifacts {
  const chatArtifacts =
    kind === 'text' || kind === 'streamText' || kind === 'streamObject'
      ? buildPreparedExecutionArtifacts(routes, chatArtifactSpec)
      : undefined;
  const structuredArtifacts =
    kind === 'structured'
      ? buildPreparedExecutionArtifacts(routes, structuredArtifactSpec)
      : undefined;
  const imageArtifacts =
    kind === 'image'
      ? buildPreparedExecutionArtifacts(routes, imageArtifactSpec)
      : undefined;
  const nativeDispatch = {
    chat:
      kind === 'text' || kind === 'streamText' || kind === 'streamObject'
        ? chatArtifacts?.dispatch
        : undefined,
    structured:
      kind === 'structured' ? structuredArtifacts?.dispatch : undefined,
    image: kind === 'image' ? imageArtifacts?.dispatch : undefined,
  };

  return {
    nativeDispatch,
    transport:
      kind === 'text' || kind === 'streamText' || kind === 'streamObject'
        ? chatArtifacts?.transport
        : kind === 'structured'
          ? structuredArtifacts?.transport
          : kind === 'image'
            ? imageArtifacts?.transport
            : undefined,
  };
}

function buildEmbeddingPlanArtifacts(
  routes: ResolvedCopilotProvider[]
): Pick<ExecutionPlan, 'nativeDispatch' | 'transport'> {
  const embeddingArtifacts = buildPreparedExecutionArtifacts(
    routes,
    embeddingArtifactSpec
  );
  return {
    nativeDispatch: {
      embedding: embeddingArtifacts.dispatch,
    },
    transport: embeddingArtifacts.transport,
  };
}

function buildRerankPlanArtifacts(
  routes: ResolvedCopilotProvider[]
): Pick<ExecutionPlan, 'nativeDispatch' | 'transport'> {
  const rerankArtifacts = buildPreparedExecutionArtifacts(
    routes,
    rerankArtifactSpec
  );
  return {
    nativeDispatch: {
      rerank: rerankArtifacts.dispatch,
    },
    transport: rerankArtifacts.transport,
  };
}

@Injectable()
export class ExecutionPlanBuilder {
  constructor(
    private readonly providers: CopilotProviderFactory,
    private readonly executionMetrics: CopilotExecutionMetrics
  ) {}

  private async buildMessagePlan<
    TKind extends Extract<
      ExecutionRequestKind,
      'text' | 'streamText' | 'streamObject' | 'structured' | 'image'
    >,
  >(
    kind: TKind,
    cond: ModelConditions,
    messages: PromptMessage[],
    options?:
      | CopilotChatOptions
      | CopilotStructuredOptions
      | CopilotImageOptions,
    filter: ProviderFilter = {}
  ): Promise<ExecutionPlanForKind<TKind>> {
    const outputType =
      kind === 'image'
        ? ModelOutputType.Image
        : kind === 'streamObject'
          ? ModelOutputType.Object
          : kind === 'structured'
            ? ModelOutputType.Structured
            : ModelOutputType.Text;

    const routes =
      kind === 'text' || kind === 'streamText' || kind === 'streamObject'
        ? await this.providers.prepareRoutes(
            kind,
            { ...cond, outputType },
            messages,
            (options as CopilotChatOptions | undefined) ?? {},
            filter
          )
        : kind === 'structured'
          ? await this.providers.prepareStructuredRoutes(
              { ...cond, outputType },
              messages,
              (options as CopilotStructuredOptions | undefined) ?? {},
              filter
            )
          : await this.providers.prepareImageRoutes(
              { ...cond, outputType },
              messages,
              (options as CopilotImageOptions | undefined) ?? {},
              filter
            );
    this.executionMetrics.recordPlan(kind, routes, filter.prefer);
    const { nativeDispatch, transport } = buildMessagePlanArtifacts(
      kind,
      routes
    );
    const plan = {
      transport,
      request: {
        kind,
        cond: { ...cond, modelId: cond.modelId },
        messages,
        options,
      } as Extract<ExecutionPlanRequest, { kind: TKind }>,
      routePolicy: {
        fallbackOrder: buildFallbackOrder(routes),
      },
      runtimePolicy: { prefer: filter.prefer },
      attachmentPolicy: { materializeRemoteAttachments: true },
      responsePostprocess: { mode: kind },
      hostPersistence: {
        persistAssistantTurn: true,
        outputKind: kind,
      },
      hostContext: {
        signal: options?.signal,
        currentMessages: messages,
      },
    } as Omit<ExecutionPlanForKind<TKind>, 'nativeDispatch' | 'serializable'>;

    return {
      nativeDispatch,
      serializable: buildSerializableExecutionPlan(routes, plan),
      ...plan,
    };
  }

  async buildTextPlan(
    cond: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions,
    filter?: ProviderFilter
  ): Promise<ExecutionPlanForKind<'text'>> {
    return await this.buildMessagePlan('text', cond, messages, options, filter);
  }

  async buildStreamTextPlan(
    cond: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions,
    filter?: ProviderFilter
  ): Promise<ExecutionPlanForKind<'streamText'>> {
    return await this.buildMessagePlan(
      'streamText',
      cond,
      messages,
      options,
      filter
    );
  }

  async buildStreamObjectPlan(
    cond: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions,
    filter?: ProviderFilter
  ): Promise<ExecutionPlanForKind<'streamObject'>> {
    return await this.buildMessagePlan(
      'streamObject',
      cond,
      messages,
      options,
      filter
    );
  }

  async buildStructuredPlan(
    cond: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotStructuredOptions,
    filter?: ProviderFilter,
    responseContract?: RequiredStructuredOutputContract
  ): Promise<ExecutionPlanForKind<'structured'>> {
    const outputType = ModelOutputType.Structured;
    const routes = await this.providers.prepareStructuredRoutes(
      { ...cond, outputType },
      messages,
      options ?? {},
      filter ?? {},
      responseContract
    );
    this.executionMetrics.recordPlan('structured', routes, filter?.prefer);
    const { nativeDispatch, transport } = buildMessagePlanArtifacts(
      'structured',
      routes
    );
    const plan = {
      transport,
      request: {
        kind: 'structured',
        cond: { ...cond, modelId: cond.modelId },
        messages,
        options,
      },
      routePolicy: {
        fallbackOrder: buildFallbackOrder(routes),
      },
      runtimePolicy: { prefer: filter?.prefer },
      attachmentPolicy: { materializeRemoteAttachments: true },
      responsePostprocess: { mode: 'structured' },
      hostPersistence: {
        persistAssistantTurn: true,
        outputKind: 'structured',
      },
      hostContext: {
        signal: options?.signal,
        currentMessages: messages,
      },
    } as Omit<
      ExecutionPlanForKind<'structured'>,
      'nativeDispatch' | 'serializable'
    >;

    return {
      nativeDispatch,
      serializable: buildSerializableExecutionPlan(routes, plan),
      ...plan,
    };
  }

  async buildImagePlan(
    cond: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotImageOptions,
    filter?: ProviderFilter
  ): Promise<ExecutionPlanForKind<'image'>> {
    return await this.buildMessagePlan(
      'image',
      cond,
      messages,
      options,
      filter
    );
  }

  async buildEmbeddingPlan(
    modelId: string,
    input: string | string[],
    options?: CopilotEmbeddingOptions
  ): Promise<ExecutionPlanForKind<'embedding'>> {
    const routes = await this.providers.prepareEmbeddingRoutes(
      modelId,
      input,
      options
    );
    this.executionMetrics.recordPlan('embedding', routes);
    const { nativeDispatch, transport } = buildEmbeddingPlanArtifacts(routes);
    const plan = {
      transport,
      request: {
        kind: 'embedding',
        cond: { modelId },
        modelId,
        input,
        options,
      },
      routePolicy: {
        fallbackOrder: buildFallbackOrder(routes),
      },
      runtimePolicy: {},
      attachmentPolicy: { materializeRemoteAttachments: false },
      responsePostprocess: { mode: 'embedding' },
      hostPersistence: {
        persistAssistantTurn: false,
        outputKind: 'embedding',
      },
      hostContext: {
        signal: options?.signal,
      },
    } as Omit<
      ExecutionPlanForKind<'embedding'>,
      'nativeDispatch' | 'serializable'
    >;

    return {
      nativeDispatch,
      serializable: buildSerializableExecutionPlan(routes, plan),
      ...plan,
    };
  }

  async buildRerankPlan(
    modelId: string,
    request: CopilotRerankRequest,
    options?: CopilotChatOptions
  ): Promise<ExecutionPlanForKind<'rerank'>> {
    const routes = await this.providers.prepareRerankRoutes(
      modelId,
      request,
      options
    );
    this.executionMetrics.recordPlan('rerank', routes);
    const { nativeDispatch, transport } = buildRerankPlanArtifacts(routes);
    const plan = {
      transport,
      request: {
        kind: 'rerank',
        cond: { modelId },
        modelId,
        request,
        options,
      },
      routePolicy: {
        fallbackOrder: buildFallbackOrder(routes),
      },
      runtimePolicy: {},
      attachmentPolicy: { materializeRemoteAttachments: false },
      responsePostprocess: { mode: 'rerank' },
      hostPersistence: {
        persistAssistantTurn: false,
        outputKind: 'rerank',
      },
      hostContext: {
        signal: options?.signal,
      },
    } as Omit<
      ExecutionPlanForKind<'rerank'>,
      'nativeDispatch' | 'serializable'
    >;

    return {
      nativeDispatch,
      serializable: buildSerializableExecutionPlan(routes, plan),
      ...plan,
    };
  }
}
