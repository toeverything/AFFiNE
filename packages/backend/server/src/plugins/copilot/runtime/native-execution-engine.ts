import { Injectable } from '@nestjs/common';

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
} from './tool/native-adapter';

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

function createNativeChatAdapter(dispatch: NativeChatDispatchPlan) {
  if (dispatch.hasTools) {
    return createNativeToolLoopAdapter(
      { preparedRoutes: dispatch.routes },
      dispatch.prepared.tools,
      {
        maxSteps: dispatch.prepared.maxSteps,
        nodeTextMiddleware: dispatch.prepared.postprocess?.nodeTextMiddleware,
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
  });
}

async function runPreparedValuePlan<TResult>(
  plan: ExecutionPlan,
  routeCount: number,
  executionMetrics: CopilotExecutionMetrics | undefined,
  run: () => Promise<TResult>
) {
  recordPreparedDispatch(executionMetrics, plan, routeCount);
  try {
    return await run();
  } catch (error) {
    throw mapNativeSemanticError(error);
  }
}

async function* mapPreparedStreamErrors<T>(
  source: AsyncIterable<T>
): AsyncIterableIterator<T> {
  try {
    yield* source;
  } catch (error) {
    throw mapNativeSemanticError(error);
  }
}

async function runChatValuePlan(
  plan: ExecutionPlan,
  dispatch: NativeChatDispatchPlan,
  executionMetrics?: CopilotExecutionMetrics
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
    }
  );
}

async function* runChatStreamPlan(
  plan: ExecutionPlan,
  dispatch: NativeChatDispatchPlan,
  executionMetrics?: CopilotExecutionMetrics
): AsyncIterableIterator<string | StreamObject> {
  const adapter = createNativeChatAdapter(dispatch);
  recordPreparedDispatch(executionMetrics, plan, dispatch.routes.length);

  if (plan.request.kind === 'streamText') {
    yield* mapPreparedStreamErrors(
      adapter.streamText(
        dispatch.prepared.request,
        plan.hostContext.signal,
        plan.request.messages
      )
    );
    return;
  }

  if (plan.request.kind === 'streamObject') {
    yield* mapPreparedStreamErrors(
      adapter.streamObject(
        dispatch.prepared.request,
        plan.hostContext.signal,
        plan.request.messages
      )
    );
    return;
  }

  throw new Error('chat stream dispatch requires streamText/streamObject plan');
}

async function* runPreparedImageArtifactPlan(
  dispatch: NativeImageDispatchPlan,
  plan: ExecutionPlan,
  executionMetrics?: CopilotExecutionMetrics
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
  } catch (error) {
    throw mapNativeSemanticError(error);
  }
  for (const artifact of result.response.images) {
    yield artifact;
  }
}

async function executePreparedPlan(
  plan: ExecutionPlan,
  executionMetrics?: CopilotExecutionMetrics
): Promise<string | number[][] | number[] | null> {
  switch (plan.request.kind) {
    case 'text': {
      const dispatch = plan.nativeDispatch?.chat;
      return dispatch
        ? await runChatValuePlan(plan, dispatch, executionMetrics)
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
          const parsed = parseNativeStructuredOutput(result.response);
          const validated = llmValidateJsonSchema(
            dispatch.prepared.request.schema,
            parsed
          );
          return JSON.stringify(validated);
        }
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
          return result.response.embeddings;
        }
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
          return result.response.scores;
        }
      );
    }
    default:
      return null;
  }
}

function executePreparedStreamPlan(
  plan: ExecutionPlan,
  executionMetrics?: CopilotExecutionMetrics
): AsyncIterableIterator<string | StreamObject> | null {
  switch (plan.request.kind) {
    case 'streamText':
    case 'streamObject': {
      const dispatch = plan.nativeDispatch?.chat;
      return dispatch
        ? runChatStreamPlan(plan, dispatch, executionMetrics)
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
  constructor(private readonly executionMetrics?: CopilotExecutionMetrics) {}

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
    const result = await executePreparedPlan(plan, this.executionMetrics);
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
    const result = executePreparedStreamPlan(plan, this.executionMetrics);
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
        this.executionMetrics
      );
    }

    return noRouteStream(plan);
  }
}
