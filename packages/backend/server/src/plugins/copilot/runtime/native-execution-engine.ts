import { Injectable, Logger } from '@nestjs/common';

import { NoCopilotProviderAvailable } from '../../../base';
import {
  llmDispatchPlan,
  llmDispatchPlanStream,
  type LlmDispatchResponse,
  llmEmbeddingDispatchPlan,
  llmImageDispatchPlan,
  type LlmImageResponse,
  llmRerankDispatchPlan,
  llmStructuredDispatchPlan,
  llmValidateJsonSchema,
  parseNativeStructuredOutput,
} from '../../../native';
import { type ByokFeatureKind, ByokService } from '../byok';
import { type StreamObject } from '../providers/types';
import { CopilotExecutionMetrics } from './execution-metrics';
import {
  type ExecutionPlan,
  type ExecutionPlanForKind,
  type NativeChatDispatchPlan,
  type NativeImageDispatchPlan,
} from './execution-plan';
import { mapNativeSemanticError } from './native-errors';
import {
  createNativeToolLoopAdapter,
  NativeProviderAdapter,
  type NativeProviderAdapterOptions,
} from './tool/native-adapter';

const logger = new Logger('NativeExecutionEngine');

function modelIdForError(modelId?: string) {
  return modelId ?? 'auto';
}

type ExecutionPlanKind = ExecutionPlan['request']['kind'];
type ValueExecutionKind = Exclude<
  ExecutionPlanKind,
  'streamText' | 'streamObject' | 'image'
>;
type StreamExecutionKind = Extract<
  ExecutionPlanKind,
  'streamText' | 'streamObject'
>;
export type NativeImageArtifact = LlmImageResponse['images'][number];

function resolveAbortSignal(
  signalOrOptions?: AbortSignal | { signal?: AbortSignal }
) {
  return signalOrOptions &&
    typeof signalOrOptions === 'object' &&
    'aborted' in signalOrOptions
    ? signalOrOptions
    : signalOrOptions?.signal;
}

function extractTextResponse(response: LlmDispatchResponse) {
  return response.message.content
    .filter(part => part.type === 'text' || part.type === 'reasoning')
    .map(part => part.text)
    .join('')
    .trim();
}

function getUsageContext(plan: ExecutionPlan) {
  const options = 'options' in plan.request ? plan.request.options : undefined;
  const requestFeatureKind =
    plan.request.kind === 'text' ||
    plan.request.kind === 'streamText' ||
    plan.request.kind === 'streamObject'
      ? 'chat'
      : plan.request.kind;
  return {
    workspaceId: options?.workspace,
    userId: options?.user,
    sessionId: options?.session,
    taskId: options?.taskId,
    actionId: options?.actionId,
    billingUnitId: options?.billingUnitId,
    featureKind: options?.featureKind ?? requestFeatureKind,
  };
}

async function recordByokUsage(
  byok: ByokService,
  plan: ExecutionPlan,
  input: {
    providerId?: string;
    model?: string | null;
    usage?: LlmDispatchResponse['usage'];
  }
) {
  const context = getUsageContext(plan);
  try {
    await byok.recordUsage({
      workspaceId: context.workspaceId,
      userId: context.userId,
      sessionId: context.sessionId,
      taskId: context.taskId,
      actionId: context.actionId,
      billingUnitId: context.billingUnitId,
      featureKind: context.featureKind as ByokFeatureKind,
      providerId: input.providerId,
      model: input.model,
      usage: input.usage,
    });
  } catch (error) {
    logger.warn(
      `Failed to record BYOK usage: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function recordSingleByokRouteFailure(
  byok: ByokService,
  plan: ExecutionPlan,
  error: unknown
) {
  const [providerId] = plan.routePolicy.fallbackOrder;
  if (plan.routePolicy.fallbackOrder.length !== 1 || !providerId) {
    return;
  }
  const context = getUsageContext(plan);
  try {
    await byok.recordProviderFailure({
      workspaceId: context.workspaceId,
      providerId,
      featureKind: context.featureKind as ByokFeatureKind,
      error,
    });
  } catch (recordError) {
    logger.warn(
      `Failed to record BYOK provider failure: ${
        recordError instanceof Error ? recordError.message : String(recordError)
      }`
    );
  }
}

function recordPreparedDispatch(
  executionMetrics: CopilotExecutionMetrics | undefined,
  plan: ExecutionPlan,
  routeCount: number
) {
  executionMetrics?.recordDispatch(
    plan.request.kind,
    'prepared_routes',
    routeCount
  );
}

function createNativeChatAdapter(
  dispatch: NativeChatDispatchPlan,
  options?: {
    onUsage?: NativeProviderAdapterOptions['onUsage'];
  }
) {
  if (dispatch.hasTools) {
    return createNativeToolLoopAdapter(
      { preparedRoutes: dispatch.routes },
      dispatch.prepared.tools,
      {
        maxSteps: dispatch.prepared.maxSteps,
        nodeTextMiddleware: dispatch.prepared.postprocess?.nodeTextMiddleware,
        onUsage: options?.onUsage,
      }
    );
  }

  const nativeDispatch = (
    _nativeRequest: typeof dispatch.prepared.request,
    signalOrOptions?: AbortSignal | { signal?: AbortSignal }
  ) =>
    llmDispatchPlanStream({
      preparedRoutes: dispatch.routes,
      signal: resolveAbortSignal(signalOrOptions),
    });

  return new NativeProviderAdapter(nativeDispatch, {
    nodeTextMiddleware: dispatch.prepared.postprocess?.nodeTextMiddleware,
    onUsage: options?.onUsage,
  });
}

async function runPreparedValuePlan<TResult>(
  plan: ExecutionPlan,
  routeCount: number,
  executionMetrics: CopilotExecutionMetrics | undefined,
  run: () => Promise<TResult>,
  byok: ByokService
) {
  recordPreparedDispatch(executionMetrics, plan, routeCount);
  try {
    return await run();
  } catch (error) {
    const mapped = mapNativeSemanticError(error);
    await recordSingleByokRouteFailure(byok, plan, mapped);
    throw mapped;
  }
}

async function* mapPreparedStreamErrors<T>(
  source: AsyncIterable<T>,
  plan: ExecutionPlan,
  byok: ByokService
): AsyncIterableIterator<T> {
  try {
    yield* source;
  } catch (error) {
    const mapped = mapNativeSemanticError(error);
    await recordSingleByokRouteFailure(byok, plan, mapped);
    throw mapped;
  }
}

async function runChatValuePlan(
  plan: ExecutionPlan,
  dispatch: NativeChatDispatchPlan,
  executionMetrics: CopilotExecutionMetrics | undefined,
  byok: ByokService
) {
  const adapter = createNativeChatAdapter(dispatch);
  return await runPreparedValuePlan(
    plan,
    dispatch.routes.length,
    executionMetrics,
    async () => {
      if (
        !dispatch.hasTools &&
        !dispatch.prepared.postprocess?.nodeTextMiddleware?.length
      ) {
        const result = await llmDispatchPlan({
          preparedRoutes: dispatch.routes,
        });
        await recordByokUsage(byok, plan, {
          providerId: result.provider_id,
          model: result.response.model,
          usage: result.response.usage,
        });
        return extractTextResponse(result.response);
      }

      if (plan.request.kind !== 'text') {
        throw new Error('chat value dispatch requires text plan');
      }

      return await adapter.text(
        dispatch.prepared.request,
        plan.hostContext.signal,
        plan.request.messages
      );
    },
    byok
  );
}

async function* runChatStreamPlan(
  plan: ExecutionPlan,
  dispatch: NativeChatDispatchPlan,
  executionMetrics: CopilotExecutionMetrics | undefined,
  byok: ByokService
): AsyncIterableIterator<string | StreamObject> {
  const adapter = createNativeChatAdapter(dispatch, {
    onUsage: async usage => {
      await recordByokUsage(byok, plan, {
        providerId: usage.providerId,
        model: usage.model,
        usage: usage.usage,
      });
    },
  });
  recordPreparedDispatch(executionMetrics, plan, dispatch.routes.length);

  if (plan.request.kind === 'streamText') {
    yield* mapPreparedStreamErrors(
      adapter.streamText(
        dispatch.prepared.request,
        plan.hostContext.signal,
        plan.request.messages
      ),
      plan,
      byok
    );
    return;
  }

  if (plan.request.kind === 'streamObject') {
    yield* mapPreparedStreamErrors(
      adapter.streamObject(
        dispatch.prepared.request,
        plan.hostContext.signal,
        plan.request.messages
      ),
      plan,
      byok
    );
    return;
  }

  throw new Error('chat stream dispatch requires streamText/streamObject plan');
}

async function* runPreparedImageArtifactPlan(
  dispatch: NativeImageDispatchPlan,
  plan: ExecutionPlan,
  executionMetrics: CopilotExecutionMetrics | undefined,
  byok: ByokService
): AsyncIterableIterator<NativeImageArtifact> {
  if (plan.request.kind !== 'image') {
    throw new Error('image dispatch requires image plan');
  }

  recordPreparedDispatch(executionMetrics, plan, dispatch.routes.length);
  let result;
  try {
    result = await llmImageDispatchPlan({
      preparedRoutes: dispatch.routes,
    });
    await recordByokUsage(byok, plan, {
      providerId: result.provider_id,
      model: dispatch.prepared.route.model,
      usage: result.response.usage
        ? {
            prompt_tokens: result.response.usage.input_tokens ?? 0,
            completion_tokens: result.response.usage.output_tokens ?? 0,
            total_tokens: result.response.usage.total_tokens ?? 0,
          }
        : undefined,
    });
  } catch (error) {
    const mapped = mapNativeSemanticError(error);
    await recordSingleByokRouteFailure(byok, plan, mapped);
    throw mapped;
  }
  for (const artifact of result.response.images) {
    yield artifact;
  }
}

async function executePreparedPlan(
  plan: ExecutionPlan,
  executionMetrics: CopilotExecutionMetrics | undefined,
  byok: ByokService
): Promise<string | number[][] | number[] | null> {
  switch (plan.request.kind) {
    case 'text': {
      const dispatch = plan.nativeDispatch?.chat;
      return dispatch
        ? await runChatValuePlan(plan, dispatch, executionMetrics, byok)
        : null;
    }
    case 'structured': {
      const dispatch = plan.nativeDispatch?.structured;
      if (!dispatch) {
        return null;
      }
      return await runPreparedValuePlan(
        plan,
        dispatch.routes.length,
        executionMetrics,
        async () => {
          const result = await llmStructuredDispatchPlan({
            preparedRoutes: dispatch.routes,
          });
          await recordByokUsage(byok, plan, {
            providerId: result.provider_id,
            model: result.response.model,
            usage: result.response.usage,
          });
          const parsed = parseNativeStructuredOutput(result.response);
          const validated = llmValidateJsonSchema(
            dispatch.prepared.request.schema,
            parsed
          );
          return JSON.stringify(validated);
        },
        byok
      );
    }
    case 'embedding': {
      const dispatch = plan.nativeDispatch?.embedding;
      if (!dispatch) {
        return null;
      }
      return await runPreparedValuePlan(
        plan,
        dispatch.routes.length,
        executionMetrics,
        async () => {
          const result = await llmEmbeddingDispatchPlan({
            preparedRoutes: dispatch.routes,
          });
          await recordByokUsage(byok, plan, {
            providerId: result.provider_id,
            model: result.response.model,
            usage: result.response.usage
              ? {
                  prompt_tokens: result.response.usage.prompt_tokens,
                  completion_tokens: 0,
                  total_tokens: result.response.usage.total_tokens,
                }
              : undefined,
          });
          return result.response.embeddings;
        },
        byok
      );
    }
    case 'rerank': {
      const dispatch = plan.nativeDispatch?.rerank;
      if (!dispatch) {
        return null;
      }
      return await runPreparedValuePlan(
        plan,
        dispatch.routes.length,
        executionMetrics,
        async () => {
          const result = await llmRerankDispatchPlan({
            preparedRoutes: dispatch.routes,
          });
          await recordByokUsage(byok, plan, {
            providerId: result.provider_id,
            model: result.response.model,
          });
          return result.response.scores;
        },
        byok
      );
    }
    default:
      return null;
  }
}

function executePreparedStreamPlan(
  plan: ExecutionPlan,
  executionMetrics: CopilotExecutionMetrics | undefined,
  byok: ByokService
): AsyncIterableIterator<string | StreamObject> | null {
  switch (plan.request.kind) {
    case 'streamText':
    case 'streamObject': {
      const dispatch = plan.nativeDispatch?.chat;
      return dispatch
        ? runChatStreamPlan(plan, dispatch, executionMetrics, byok)
        : null;
    }
    default:
      return null;
  }
}

function noRouteStream<T>(plan: ExecutionPlan) {
  return (async function* (): AsyncIterableIterator<T> {
    yield* [] as T[];
    throw new NoCopilotProviderAvailable({
      modelId: modelIdForError(plan.request.cond.modelId),
    });
  })();
}

@Injectable()
export class NativeExecutionEngine {
  constructor(
    private readonly byok: ByokService,
    private readonly executionMetrics?: CopilotExecutionMetrics
  ) {}

  private noRoute(plan: ExecutionPlan): never {
    throw new NoCopilotProviderAvailable({
      modelId: modelIdForError(plan.request.cond.modelId),
    });
  }

  async execute(
    plan: ExecutionPlanForKind<'text' | 'structured'>
  ): Promise<string>;
  async execute(plan: ExecutionPlanForKind<'embedding'>): Promise<number[][]>;
  async execute(plan: ExecutionPlanForKind<'rerank'>): Promise<number[]>;
  async execute(
    plan: ExecutionPlanForKind<ValueExecutionKind>
  ): Promise<string | number[][] | number[]> {
    const result = await executePreparedPlan(
      plan,
      this.executionMetrics,
      this.byok
    );
    if (result === null) {
      return this.noRoute(plan);
    }

    return result;
  }

  executeStream(
    plan: ExecutionPlanForKind<'streamText'>
  ): AsyncIterableIterator<string>;
  executeStream(
    plan: ExecutionPlanForKind<'streamObject'>
  ): AsyncIterableIterator<StreamObject>;
  executeStream(
    plan: ExecutionPlanForKind<StreamExecutionKind>
  ): AsyncIterableIterator<string | StreamObject> {
    const result = executePreparedStreamPlan(
      plan,
      this.executionMetrics,
      this.byok
    );
    if (result) {
      return result;
    }

    return noRouteStream(plan);
  }

  executeImageArtifacts(
    plan: ExecutionPlanForKind<'image'>
  ): AsyncIterableIterator<NativeImageArtifact> {
    const dispatch = plan.nativeDispatch?.image;
    if (dispatch) {
      return runPreparedImageArtifactPlan(
        dispatch,
        plan,
        this.executionMetrics,
        this.byok
      );
    }

    return noRouteStream(plan);
  }
}
