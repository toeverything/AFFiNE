import serverNativeModule from '@affine/server-native';
import test from 'ava';
import Sinon from 'sinon';
import { z } from 'zod';

import {
  CopilotPromptInvalid,
  CopilotQuotaExceeded,
  NoCopilotProviderAvailable,
} from '../../base';
import {
  type LlmBackendConfig,
  type LlmEmbeddingRequest,
  type LlmImageRequest,
  llmMatchModelCapabilities,
  type LlmPreparedDispatchRoute,
  type LlmPreparedEmbeddingDispatchRoute,
  type LlmPreparedImageDispatchRoute,
  type LlmPreparedRerankDispatchRoute,
  type LlmPreparedStructuredDispatchRoute,
  type LlmProtocol,
  type LlmRequest,
  type LlmRerankRequest,
  llmResolveRequestedModelMatch,
  type LlmStructuredRequest,
} from '../../native';
import type {
  CopilotProviderProfile,
  ProviderMiddlewareConfig,
} from '../../plugins/copilot/config';
import { CopilotProviderFactory } from '../../plugins/copilot/providers/factory';
import { OpenAIProvider } from '../../plugins/copilot/providers/openai';
import { CopilotProvider } from '../../plugins/copilot/providers/provider';
import { buildProviderRegistry } from '../../plugins/copilot/providers/provider-registry';
import {
  type CopilotProviderExecution,
  type NativeExecutionRoute,
  type ProviderDriverSpec,
} from '../../plugins/copilot/providers/provider-runtime-contract';
import {
  type CopilotProviderModel,
  CopilotProviderType,
  type ModelFullConditions,
  ModelInputType,
  ModelOutputType,
} from '../../plugins/copilot/providers/types';
import { CapabilityRuntime } from '../../plugins/copilot/runtime/capability-runtime';
import {
  buildStructuredResponseContract,
  parseCapabilityMatchRequest,
  parseExecutionPlan,
  parseProviderDriverSpec,
  parseRequestedModelMatchRequest,
  type RequiredStructuredOutputContract,
  requireStructuredOutputContract,
} from '../../plugins/copilot/runtime/contracts';
import { ExecutionPlanBuilder } from '../../plugins/copilot/runtime/execution-plan';
import { NativeExecutionEngine } from '../../plugins/copilot/runtime/native-execution-engine';
import { buildNativeRequest } from '../../plugins/copilot/runtime/native-request-runtime';
import { getProviderRuntimeHost } from '../../plugins/copilot/runtime/provider-runtime-context';
import { defineTool } from '../../plugins/copilot/tools/tool';
import {
  nativeMessages,
  nativeUserText,
  promptMessages,
  singleUserPromptMessages,
  systemPrompt,
  userPrompt,
} from './prompt-test-helper';

function createNativeExecutionEngine() {
  return new NativeExecutionEngine({
    recordUsage: Sinon.stub().resolves(),
    recordProviderFailure: Sinon.stub().resolves(),
  } as never);
}

function structuredOptions(
  schema: z.ZodTypeAny,
  extra?: Record<string, unknown>
) {
  const { responseSchemaJson, schemaHash } =
    buildStructuredResponseContract(schema);
  return {
    responseSchemaJson,
    schemaHash,
    ...extra,
  };
}

function structuredContract(
  schema: z.ZodTypeAny
): RequiredStructuredOutputContract {
  const contract = buildStructuredResponseContract(schema);
  const requiredContract = requireStructuredOutputContract(contract);
  if (!requiredContract) {
    throw new Error('structured response contract is required');
  }

  return requiredContract;
}

class TestOpenAIProvider extends CopilotProvider<{ apiKey: string }> {
  readonly type = CopilotProviderType.OpenAI;
  protected resolveModelBackendKind() {
    return 'openai_responses' as const;
  }

  configured() {
    return true;
  }

  async text(_cond: any, _messages: any[], _options?: any) {
    return '';
  }

  async *streamText(_cond: any, _messages: any[], _options?: any) {
    yield '';
  }

  exposeMetricLabels(execution?: CopilotProviderExecution) {
    return this.metricLabels('gpt-5-mini', {}, execution);
  }

  exposeMiddleware(execution?: CopilotProviderExecution) {
    return this.getActiveProviderMiddleware(execution);
  }
}

class DriverOnlyProvider extends CopilotProvider<{ apiKey: string }> {
  readonly type = CopilotProviderType.OpenAI;
  protected resolveModelBackendKind() {
    return 'openai_responses' as const;
  }

  configured() {
    return true;
  }

  override getDriverSpec(): ProviderDriverSpec {
    return {
      createBackendConfig: async () => ({
        base_url: 'https://api.openai.com',
        auth_token: 'test-key',
      }),
      mapError: (error: unknown) => error,
      structured: {},
      embedding: {},
      rerank: {},
      image: {},
    };
  }
}

async function collectAsync<T>(iterable: AsyncIterable<T>) {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

const OPENAI_BASE_URL = 'https://api.openai.com';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

function summarizePreparedDispatchRoutes(routes: unknown) {
  if (!Array.isArray(routes)) {
    return routes;
  }

  return routes.map(route => {
    const request =
      route && typeof route === 'object' && 'request' in route
        ? (route as Record<string, any>).request
        : undefined;
    const firstContent =
      request?.messages?.[0]?.content?.find?.(
        (part: { type?: string }) => part?.type === 'text'
      )?.text ?? null;

    const requestShape: Record<string, unknown> = {
      keys: request ? Object.keys(request).sort() : [],
      firstContent,
      schemaKeys: request?.schema?.properties
        ? Object.keys(request.schema.properties).sort()
        : undefined,
      inputCount: Array.isArray(request?.inputs) ? request.inputs.length : 0,
      query: request?.query,
      candidateCount: Array.isArray(request?.candidates)
        ? request.candidates.length
        : 0,
      toolNames: Array.isArray(request?.tools)
        ? request.tools.map((tool: { name?: string }) => tool.name)
        : [],
    };

    if (request && typeof request === 'object' && 'prompt' in request) {
      requestShape.prompt = request.prompt;
    }
    if (request && typeof request === 'object' && 'images' in request) {
      requestShape.imageCount = Array.isArray(request.images)
        ? request.images.length
        : 0;
    }

    return {
      providerId:
        route && typeof route === 'object' && 'provider_id' in route
          ? (route as Record<string, any>).provider_id
          : undefined,
      model:
        route && typeof route === 'object' && 'model' in route
          ? (route as Record<string, any>).model
          : undefined,
      requestShape,
    };
  });
}

function nativeBackendConfig(
  authToken: string,
  baseUrl: string = OPENAI_BASE_URL
): LlmBackendConfig {
  return { base_url: baseUrl, auth_token: authToken };
}

type NativeRouteOptions<TRequest> = {
  providerId: string;
  request: TRequest;
  authToken: string;
  protocol?: LlmProtocol;
  model?: string;
  baseUrl?: string;
};

function nativeRoute(
  options: NativeRouteOptions<LlmRequest>
): LlmPreparedDispatchRoute;
function nativeRoute(
  options: NativeRouteOptions<LlmStructuredRequest>
): LlmPreparedStructuredDispatchRoute;
function nativeRoute(
  options: NativeRouteOptions<LlmEmbeddingRequest>
): LlmPreparedEmbeddingDispatchRoute;
function nativeRoute(
  options: NativeRouteOptions<LlmRerankRequest>
): LlmPreparedRerankDispatchRoute;
function nativeRoute(
  options: NativeRouteOptions<LlmImageRequest>
): LlmPreparedImageDispatchRoute;
function nativeRoute({
  providerId,
  request,
  authToken,
  protocol = 'openai_chat',
  model = 'gpt-5-mini',
  baseUrl = OPENAI_BASE_URL,
}: NativeRouteOptions<
  | LlmRequest
  | LlmStructuredRequest
  | LlmEmbeddingRequest
  | LlmRerankRequest
  | LlmImageRequest
>) {
  return {
    provider_id: providerId,
    protocol,
    model,
    config: nativeBackendConfig(authToken, baseUrl),
    request,
  };
}

function preparedRoute({
  providerId,
  authToken,
  protocol = 'openai_chat',
  model = 'gpt-5-mini',
  baseUrl = OPENAI_BASE_URL,
}: {
  providerId: string;
  authToken: string;
  protocol?: LlmProtocol;
  model?: string;
  baseUrl?: string;
}): NativeExecutionRoute & { providerId: string } {
  return {
    providerId,
    protocol,
    model,
    backendConfig: nativeBackendConfig(authToken, baseUrl),
  };
}

function nativeTextRequest(
  text: string,
  model: string = 'gpt-5-mini'
): LlmRequest {
  return { model, messages: nativeMessages(nativeUserText(text)) };
}

function nativeStructuredRequest(
  text: string,
  schema: Record<string, unknown>,
  model: string = 'gpt-5-mini'
): LlmStructuredRequest {
  return { ...nativeTextRequest(text, model), schema };
}

function nativeEmbeddingRequest(
  input: string,
  model: string = 'text-embedding-3-small'
): LlmEmbeddingRequest {
  return { model, inputs: [input] };
}

function nativeRerankRequest(
  query: string,
  candidates: Array<{ id?: string; text: string }>,
  model: string = 'gpt-4o-mini'
): LlmRerankRequest {
  return { model, query, candidates };
}

function nativeImageRequest(
  prompt: string,
  model: string = 'gpt-image-1'
): LlmImageRequest {
  return { model, prompt, operation: 'generate', images: [] };
}

function createProvider(profileMiddleware?: ProviderMiddlewareConfig) {
  const provider = new TestOpenAIProvider();
  (provider as any).AFFiNEConfig = {
    copilot: {
      providers: {
        profiles: [
          {
            id: 'openai-main',
            type: CopilotProviderType.OpenAI,
            config: { apiKey: 'test' },
            middleware: profileMiddleware,
          },
        ],
        defaults: {},
        openai: { apiKey: 'legacy' },
      },
    },
  };
  return provider;
}

function createExecution(
  provider: TestOpenAIProvider
): CopilotProviderExecution {
  const registry = buildProviderRegistry(
    (provider as any).AFFiNEConfig.copilot.providers
  );
  const profile = registry.profiles.get('openai-main');
  if (!profile) {
    throw new Error('missing openai-main profile');
  }
  return {
    providerId: 'openai-main',
    profile,
  };
}

test('metricLabels should include active provider id', t => {
  const provider = createProvider();
  const labels = provider.exposeMetricLabels(createExecution(provider));
  t.is(labels.providerId, 'openai-main');
});

test('CapabilityRuntime should route capability plans through plan builder and native engine', async t => {
  const plans = {
    buildTextPlan: Sinon.stub().resolves({ kind: 'text-plan' }),
    buildStreamTextPlan: Sinon.stub().resolves({ kind: 'stream-text-plan' }),
    buildStreamObjectPlan: Sinon.stub().resolves({
      kind: 'stream-object-plan',
    }),
    buildStructuredPlan: Sinon.stub().resolves({
      kind: 'structured-plan',
      routePolicy: { fallbackOrder: ['openai-primary'] },
    }),
    buildEmbeddingPlan: Sinon.stub().resolves({
      kind: 'embedding-plan',
      routePolicy: { fallbackOrder: ['openai-primary'] },
    }),
    buildRerankPlan: Sinon.stub().resolves({
      kind: 'rerank-plan',
      routePolicy: { fallbackOrder: ['openai-primary'] },
    }),
  };
  const engine = {
    execute: Sinon.stub().callsFake(
      async (plan: {
        kind: string;
        routePolicy?: { fallbackOrder: string[] };
      }) => {
        switch (plan.kind) {
          case 'text-plan':
            return 'done';
          case 'structured-plan':
            return '{"ok":true}';
          case 'embedding-plan':
            return [[0.1, 0.2]];
          case 'rerank-plan':
            return [0.9, 0.1];
          default:
            throw new Error(`unexpected execute plan: ${plan.kind}`);
        }
      }
    ),
    executeStream: Sinon.stub().callsFake((plan: { kind: string }) => {
      switch (plan.kind) {
        case 'stream-text-plan':
          return (async function* () {
            yield 'chunk';
          })();
        case 'stream-object-plan':
          return (async function* () {
            yield { type: 'text-delta', textDelta: 'chunk' } as const;
          })();
        default:
          throw new Error(`unexpected executeStream plan: ${plan.kind}`);
      }
    }),
  };
  const runtime = new CapabilityRuntime(plans as never, engine as never);
  const schema = z.object({ ok: z.boolean() });
  const cases = [
    {
      title: 'text',
      planBuilder: plans.buildTextPlan,
      execute: () =>
        runtime.text(
          { modelId: 'gpt-5-mini' },
          promptMessages(userPrompt('hi'))
        ),
      expected: 'done',
      executionStub: engine.execute,
      expectedPlan: { kind: 'text-plan' },
    },
    {
      title: 'streamText',
      planBuilder: plans.buildStreamTextPlan,
      execute: () =>
        collectAsync(
          runtime.streamText(
            { modelId: 'gpt-5-mini' },
            promptMessages(userPrompt('hi'))
          )
        ),
      expected: ['chunk'],
      executionStub: engine.executeStream,
      expectedPlan: { kind: 'stream-text-plan' },
    },
    {
      title: 'streamObject',
      planBuilder: plans.buildStreamObjectPlan,
      execute: () =>
        collectAsync(
          runtime.streamObject(
            { modelId: 'gpt-5-mini' },
            promptMessages(userPrompt('hi'))
          )
        ),
      expected: [{ type: 'text-delta', textDelta: 'chunk' }],
      executionStub: engine.executeStream,
      expectedPlan: { kind: 'stream-object-plan' },
    },
    {
      title: 'structured',
      planBuilder: plans.buildStructuredPlan,
      execute: () =>
        runtime.generateStructured(
          { modelId: 'gpt-5-mini' },
          promptMessages(userPrompt('hi')),
          structuredOptions(schema),
          undefined,
          structuredContract(schema)
        ),
      expected: '{"ok":true}',
      executionStub: engine.execute,
      expectedPlan: {
        kind: 'structured-plan',
        routePolicy: { fallbackOrder: ['openai-primary'] },
      },
    },
    {
      title: 'embedding',
      planBuilder: plans.buildEmbeddingPlan,
      execute: () => runtime.embed('text-embedding-3-small', 'hello world'),
      expected: [[0.1, 0.2]],
      executionStub: engine.execute,
      expectedPlan: {
        kind: 'embedding-plan',
        routePolicy: { fallbackOrder: ['openai-primary'] },
      },
    },
    {
      title: 'rerank',
      planBuilder: plans.buildRerankPlan,
      execute: () =>
        runtime.rerank('gpt-4o-mini', {
          query: 'programming',
          candidates: [{ text: 'React is a UI library.' }],
        }),
      expected: [0.9, 0.1],
      executionStub: engine.execute,
      expectedPlan: {
        kind: 'rerank-plan',
        routePolicy: { fallbackOrder: ['openai-primary'] },
      },
    },
  ] as const;

  for (const testCase of cases) {
    t.deepEqual(await testCase.execute(), testCase.expected, testCase.title);
    Sinon.assert.calledOnce(testCase.planBuilder);
    Sinon.assert.calledWith(testCase.executionStub, testCase.expectedPlan);
  }
});

test('CapabilityRuntime should defer no-route embedding plans to native engine', async t => {
  const plans = {
    buildEmbeddingPlan: Sinon.stub().resolves({
      kind: 'embedding-plan',
      routePolicy: { fallbackOrder: [] },
      routes: [{}],
    }),
  };
  const engine = {
    execute: Sinon.stub().rejects(
      new NoCopilotProviderAvailable({
        modelId: 'text-embedding-3-small',
      })
    ),
  };
  const runtime = new CapabilityRuntime(plans as never, engine as never);

  const error = await t.throwsAsync(() =>
    runtime.embed('text-embedding-3-small', 'hello world')
  );

  t.true(error instanceof NoCopilotProviderAvailable);
  Sinon.assert.calledOnce(engine.execute);
  Sinon.assert.calledWith(engine.execute, {
    kind: 'embedding-plan',
    routePolicy: { fallbackOrder: [] },
    routes: [{}],
  });
});

test('NativeExecutionEngine should expose execute/executeStream as the single plan entrypoints', async t => {
  const engine = createNativeExecutionEngine();
  let dispatchCalls = 0;
  let streamCalls = 0;

  const originalDispatch = (serverNativeModule as any).llmDispatchPrepared;
  const originalStream = (serverNativeModule as any).llmDispatchPreparedStream;
  (serverNativeModule as any).llmDispatchPrepared = () => {
    dispatchCalls += 1;
    return JSON.stringify({
      provider_id: 'openai-primary',
      response: {
        id: 'chat_execute',
        model: 'gpt-5-mini',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'execute-ok' }],
        },
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
        finish_reason: 'stop',
      },
    });
  };
  (serverNativeModule as any).llmDispatchPreparedStream = (
    _routesJson: string,
    callback: (error: Error | null, arg: string) => void
  ) => {
    streamCalls += 1;
    callback(null, JSON.stringify({ type: 'text_delta', text: 'stream-ok' }));
    callback(null, '__AFFINE_LLM_STREAM_END__');
    return { abort() {} };
  };
  t.teardown(() => {
    (serverNativeModule as any).llmDispatchPrepared = originalDispatch;
    (serverNativeModule as any).llmDispatchPreparedStream = originalStream;
  });

  const text = await engine.execute({
    nativeDispatch: {
      chat: {
        routes: [
          nativeRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
            request: nativeTextRequest('hello'),
          }),
        ],
        prepared: {
          route: preparedRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
          }),
          request: nativeTextRequest('hello'),
          tools: {},
          postprocess: { nodeTextMiddleware: [] },
        },
        hasTools: false,
      },
    },
    request: {
      kind: 'text',
      cond: { modelId: 'gpt-5-mini' },
      messages: singleUserPromptMessages('hello'),
      options: undefined,
    },
    routePolicy: { fallbackOrder: ['openai-primary'] },
    runtimePolicy: {},
    attachmentPolicy: { materializeRemoteAttachments: true },
    responsePostprocess: { mode: 'text' },
    hostPersistence: { persistAssistantTurn: true, outputKind: 'text' },
    hostContext: {},
  });
  const chunks = await collectAsync(
    engine.executeStream({
      nativeDispatch: {
        chat: {
          routes: [
            nativeRoute({
              providerId: 'openai-primary',
              authToken: 'primary-key',
              request: nativeTextRequest('hello'),
            }),
          ],
          prepared: {
            route: preparedRoute({
              providerId: 'openai-primary',
              authToken: 'primary-key',
            }),
            request: nativeTextRequest('hello'),
            tools: {},
            postprocess: { nodeTextMiddleware: [] },
          },
          hasTools: false,
        },
      },
      request: {
        kind: 'streamText',
        cond: { modelId: 'gpt-5-mini' },
        messages: singleUserPromptMessages('hello'),
        options: undefined,
      },
      routePolicy: { fallbackOrder: ['openai-primary'] },
      runtimePolicy: {},
      attachmentPolicy: { materializeRemoteAttachments: true },
      responsePostprocess: { mode: 'streamText' },
      hostPersistence: { persistAssistantTurn: true, outputKind: 'streamText' },
      hostContext: {},
    })
  );

  t.is(text, 'execute-ok');
  t.deepEqual(chunks, ['stream-ok']);
  t.is(dispatchCalls, 1);
  t.is(streamCalls, 1);
});

test('NativeExecutionEngine should record BYOK usage when stream finalizes with selected provider', async t => {
  const byok = {
    recordUsage: Sinon.stub().resolves(),
  };
  const engine = new NativeExecutionEngine(byok as never);
  const providerId = 'byok-aaaaaaaaaaaa-openai-server-key1';

  const originalStream = (serverNativeModule as any).llmDispatchPreparedStream;
  (serverNativeModule as any).llmDispatchPreparedStream = (
    _routesJson: string,
    callback: (error: Error | null, arg: string) => void
  ) => {
    callback(
      null,
      JSON.stringify({
        type: 'message_start',
        model: 'gpt-5-mini',
      })
    );
    callback(null, JSON.stringify({ type: 'text_delta', text: 'ok' }));
    callback(
      null,
      JSON.stringify({
        type: 'done',
        finish_reason: 'stop',
        usage: {
          prompt_tokens: 2,
          completion_tokens: 3,
          total_tokens: 5,
        },
      })
    );
    callback(
      null,
      JSON.stringify({
        type: 'provider_selected',
        provider_id: providerId,
      })
    );
    callback(null, '__AFFINE_LLM_STREAM_END__');
    return { abort() {} };
  };
  t.teardown(() => {
    (serverNativeModule as any).llmDispatchPreparedStream = originalStream;
  });

  const chunks = await collectAsync(
    engine.executeStream({
      nativeDispatch: {
        chat: {
          routes: [
            nativeRoute({
              providerId,
              authToken: 'byok-key',
              request: nativeTextRequest('hello'),
            }),
          ],
          prepared: {
            route: preparedRoute({
              providerId,
              authToken: 'byok-key',
            }),
            request: nativeTextRequest('hello'),
            tools: {},
            postprocess: { nodeTextMiddleware: [] },
          },
          hasTools: false,
        },
      },
      request: {
        kind: 'streamText',
        cond: { modelId: 'gpt-5-mini' },
        messages: singleUserPromptMessages('hello'),
        options: {
          workspace: 'workspace-1',
          user: 'user-1',
          session: 'session-1',
          featureKind: 'chat',
        },
      },
      routePolicy: { fallbackOrder: [providerId] },
      runtimePolicy: {},
      attachmentPolicy: { materializeRemoteAttachments: true },
      responsePostprocess: { mode: 'streamText' },
      hostPersistence: { persistAssistantTurn: true, outputKind: 'streamText' },
      hostContext: {},
    })
  );

  t.deepEqual(chunks, ['ok']);
  Sinon.assert.calledOnceWithMatch(byok.recordUsage, {
    workspaceId: 'workspace-1',
    userId: 'user-1',
    sessionId: 'session-1',
    featureKind: 'chat',
    providerId,
    model: 'gpt-5-mini',
    usage: {
      prompt_tokens: 2,
      completion_tokens: 3,
      total_tokens: 5,
    },
  });
});

test('NativeExecutionEngine should record plain text BYOK usage as chat by default', async t => {
  const byok = {
    recordUsage: Sinon.stub().resolves(),
    recordProviderFailure: Sinon.stub().resolves(),
  };
  const engine = new NativeExecutionEngine(byok as never);
  const providerId = 'byok-aaaaaaaaaaaa-openai-server-key1';

  const originalDispatch = (serverNativeModule as any).llmDispatchPrepared;
  (serverNativeModule as any).llmDispatchPrepared = () => {
    return JSON.stringify({
      provider_id: providerId,
      response: {
        id: 'chat_execute',
        model: 'gpt-5-mini',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'execute-ok' }],
        },
        usage: {
          prompt_tokens: 1,
          completion_tokens: 2,
          total_tokens: 3,
        },
        finish_reason: 'stop',
      },
    });
  };
  t.teardown(() => {
    (serverNativeModule as any).llmDispatchPrepared = originalDispatch;
  });

  const text = await engine.execute({
    nativeDispatch: {
      chat: {
        routes: [
          nativeRoute({
            providerId,
            authToken: 'byok-key',
            request: nativeTextRequest('hello'),
          }),
        ],
        prepared: {
          route: preparedRoute({
            providerId,
            authToken: 'byok-key',
          }),
          request: nativeTextRequest('hello'),
          tools: {},
          postprocess: { nodeTextMiddleware: [] },
        },
        hasTools: false,
      },
    },
    request: {
      kind: 'text',
      cond: { modelId: 'gpt-5-mini' },
      messages: singleUserPromptMessages('hello'),
      options: {
        workspace: 'workspace-1',
        user: 'user-1',
        session: 'session-1',
      },
    },
    routePolicy: { fallbackOrder: [providerId] },
    runtimePolicy: {},
    attachmentPolicy: { materializeRemoteAttachments: true },
    responsePostprocess: { mode: 'text' },
    hostPersistence: { persistAssistantTurn: true, outputKind: 'text' },
    hostContext: {},
  });

  t.is(text, 'execute-ok');
  Sinon.assert.calledOnceWithMatch(byok.recordUsage, {
    workspaceId: 'workspace-1',
    userId: 'user-1',
    sessionId: 'session-1',
    featureKind: 'chat',
    providerId,
    model: 'gpt-5-mini',
    usage: {
      prompt_tokens: 1,
      completion_tokens: 2,
      total_tokens: 3,
    },
  });
});

test('NativeExecutionEngine should not fail stream when BYOK usage recording fails', async t => {
  const byok = {
    recordUsage: Sinon.stub().rejects(new Error('usage db down')),
  };
  const engine = new NativeExecutionEngine(byok as never);
  const providerId = 'byok-aaaaaaaaaaaa-openai-server-key1';

  const originalStream = (serverNativeModule as any).llmDispatchPreparedStream;
  (serverNativeModule as any).llmDispatchPreparedStream = (
    _routesJson: string,
    callback: (error: Error | null, arg: string) => void
  ) => {
    callback(
      null,
      JSON.stringify({ type: 'message_start', model: 'gpt-5-mini' })
    );
    callback(null, JSON.stringify({ type: 'text_delta', text: 'ok' }));
    callback(
      null,
      JSON.stringify({
        type: 'done',
        finish_reason: 'stop',
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      })
    );
    callback(
      null,
      JSON.stringify({ type: 'provider_selected', provider_id: providerId })
    );
    callback(null, '__AFFINE_LLM_STREAM_END__');
    return { abort() {} };
  };
  t.teardown(() => {
    (serverNativeModule as any).llmDispatchPreparedStream = originalStream;
  });

  const chunks = await collectAsync(
    engine.executeStream({
      nativeDispatch: {
        chat: {
          routes: [
            nativeRoute({
              providerId,
              authToken: 'byok-key',
              request: nativeTextRequest('hello'),
            }),
          ],
          prepared: {
            route: preparedRoute({ providerId, authToken: 'byok-key' }),
            request: nativeTextRequest('hello'),
            tools: {},
            postprocess: { nodeTextMiddleware: [] },
          },
          hasTools: false,
        },
      },
      request: {
        kind: 'streamText',
        cond: { modelId: 'gpt-5-mini' },
        messages: singleUserPromptMessages('hello'),
        options: {
          workspace: 'workspace-1',
          user: 'user-1',
          session: 'session-1',
          featureKind: 'chat',
        },
      },
      routePolicy: { fallbackOrder: [providerId] },
      runtimePolicy: {},
      attachmentPolicy: { materializeRemoteAttachments: true },
      responsePostprocess: { mode: 'streamText' },
      hostPersistence: { persistAssistantTurn: true, outputKind: 'streamText' },
      hostContext: {},
    })
  );

  t.deepEqual(chunks, ['ok']);
  Sinon.assert.calledOnce(byok.recordUsage);
});

test('CopilotProviderFactory should return no prepared routes when native prepare returns null', async t => {
  const provider = new DriverOnlyProvider();
  (provider as any).AFFiNEConfig = { copilot: { providers: { openai: {} } } };
  (provider as any).toolExecutorHost = {
    createNativeAdapter: () => {
      throw new Error('native adapter should not be used');
    },
    getTools: async () => ({}),
  };
  const runtimeHost = getProviderRuntimeHost(provider);
  runtimeHost.prepare.chat = async () => null;
  runtimeHost.prepare.structured = async () => null;
  runtimeHost.prepare.embedding = async () => null;
  runtimeHost.prepare.rerank = async () => null;

  const registryService = {
    getRegistry: () =>
      buildProviderRegistry({
        profiles: [
          {
            id: 'openai-main',
            type: CopilotProviderType.OpenAI,
            config: { apiKey: 'test-key' },
          },
        ],
        defaults: {},
        openai: { apiKey: 'test-key' },
      }),
  };
  const server = {
    enableFeature: Sinon.stub(),
    disableFeature: Sinon.stub(),
  };
  const access = {
    resolveRouteAccess: Sinon.stub().resolves({
      byokProfiles: [],
      quotaBackedRoutesAvailable: true,
    }),
  };
  const factory = new CopilotProviderFactory(
    server as never,
    registryService as never,
    access as never
  );
  factory.register('openai-main', provider);

  const chatRoutes = await factory.prepareRoutes(
    'text',
    {
      modelId: 'gpt-5-mini',
      outputType: ModelOutputType.Text,
    },
    singleUserPromptMessages('hello')
  );
  const structuredRoutes = await factory.prepareStructuredRoutes(
    {
      modelId: 'gpt-5-mini',
      outputType: ModelOutputType.Structured,
    },
    singleUserPromptMessages('hello'),
    structuredOptions(z.object({ ok: z.boolean() })),
    {},
    structuredContract(z.object({ ok: z.boolean() }))
  );
  const embeddingRoutes = await factory.prepareEmbeddingRoutes(
    'text-embedding-3-small',
    'hello world'
  );
  const rerankRoutes = await factory.prepareRerankRoutes('gpt-4o-mini', {
    query: 'programming',
    candidates: [{ text: 'React is a UI library.' }],
  });

  t.snapshot({
    chat: {
      length: chatRoutes.length,
      providerId: chatRoutes[0]?.providerId,
      prepared: chatRoutes[0]?.prepared,
    },
    structured: {
      length: structuredRoutes.length,
      prepared: structuredRoutes[0]?.preparedStructured,
    },
    embedding: {
      length: embeddingRoutes.length,
      prepared: embeddingRoutes[0]?.preparedEmbedding,
    },
    rerank: {
      length: rerankRoutes.length,
      prepared: rerankRoutes[0]?.preparedRerank,
    },
  });
});

test('driver-only provider should use base native driver templates', async t => {
  const provider = new DriverOnlyProvider();
  (provider as any).AFFiNEConfig = { copilot: { providers: { openai: {} } } };
  (provider as any).toolExecutorHost = {
    createNativeAdapter: () => ({
      text: async () => 'driver text',
      streamText: async function* () {
        yield 'driver stream';
      },
      streamObject: async function* () {
        yield { type: 'text-delta', textDelta: 'driver object' };
      },
    }),
    getTools: async () => ({}),
  };
  const originalStructured = (serverNativeModule as any).llmStructuredDispatch;
  const originalEmbedding = (serverNativeModule as any).llmEmbeddingDispatch;
  const originalRerank = (serverNativeModule as any).llmRerankDispatch;
  (serverNativeModule as any).llmStructuredDispatch = (
    _protocol: string,
    _backendConfigJson: string,
    _requestJson: string
  ) =>
    JSON.stringify({
      id: 'structured_1',
      model: 'gpt-5-mini',
      output_text: '{"ok":true}',
      output_json: { ok: true },
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      finish_reason: 'stop',
    });
  (serverNativeModule as any).llmEmbeddingDispatch = (
    _protocol: string,
    _backendConfigJson: string,
    _requestJson: string
  ) => JSON.stringify({ embeddings: [[0.1, 0.2]] });
  (serverNativeModule as any).llmRerankDispatch = (
    _protocol: string,
    _backendConfigJson: string,
    _requestJson: string
  ) => JSON.stringify({ scores: [0.9, 0.1] });
  t.teardown(() => {
    (serverNativeModule as any).llmStructuredDispatch = originalStructured;
    (serverNativeModule as any).llmEmbeddingDispatch = originalEmbedding;
    (serverNativeModule as any).llmRerankDispatch = originalRerank;
  });

  const runtimeHost = getProviderRuntimeHost(provider);
  const schema = z.object({ ok: z.boolean() });
  const helloPrompt = promptMessages(userPrompt('hello'));
  const cases = [
    {
      title: 'text',
      run: () => runtimeHost.run.text({ modelId: 'gpt-5-mini' }, helloPrompt),
      expected: 'driver text',
    },
    {
      title: 'streamText',
      run: () =>
        collectAsync(
          runtimeHost.run.streamText({ modelId: 'gpt-5-mini' }, helloPrompt)
        ),
      expected: ['driver stream'],
    },
    {
      title: 'streamObject',
      run: () =>
        collectAsync(
          runtimeHost.run.streamObject({ modelId: 'gpt-5-mini' }, helloPrompt)
        ),
      expected: [{ type: 'text-delta', textDelta: 'driver object' }],
    },
    {
      title: 'structured',
      run: () =>
        runtimeHost.run.structured(
          { modelId: 'gpt-5-mini' },
          helloPrompt,
          structuredOptions(schema),
          structuredContract(schema)
        ),
      expected: '{"ok":true}',
    },
    {
      title: 'embedding',
      run: () =>
        runtimeHost.run.embedding(
          { modelId: 'text-embedding-3-small' },
          'hello world'
        ),
      expected: [[0.1, 0.2]],
    },
    {
      title: 'rerank',
      run: () =>
        runtimeHost.run.rerank(
          { modelId: 'gpt-4o-mini' },
          {
            query: 'programming',
            candidates: [{ text: 'React is a UI library.' }],
          }
        ),
      expected: [0.9, 0.1],
    },
  ] as const;

  for (const testCase of cases) {
    t.deepEqual(await testCase.run(), testCase.expected, testCase.title);
  }
});

test('driver-only provider should require explicit structured response contracts', async t => {
  const provider = new DriverOnlyProvider();
  (provider as any).AFFiNEConfig = { copilot: { providers: { openai: {} } } };
  (provider as any).toolExecutorHost = {
    createNativeAdapter: () => {
      throw new Error(
        'chat adapter should not be used in non-chat driver test'
      );
    },
    getTools: async () => ({}),
  };

  const schemaJson = {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
    },
    additionalProperties: false,
    required: ['ok'],
  };
  let capturedRequest:
    | {
        schema?: unknown;
        strict?: boolean;
        messages?: Array<{
          response_format?: {
            response_schema_json?: unknown;
            strict?: boolean;
          };
        }>;
      }
    | undefined;

  const original = (serverNativeModule as any)
    .llmBuildCanonicalStructuredRequest;
  (serverNativeModule as any).llmBuildCanonicalStructuredRequest = (
    requestJson: string
  ) => {
    capturedRequest = JSON.parse(requestJson);
    return original(requestJson);
  };
  t.teardown(() => {
    (serverNativeModule as any).llmBuildCanonicalStructuredRequest = original;
  });

  const error = await t.throwsAsync(() =>
    getProviderRuntimeHost(provider).prepare.structured(
      { modelId: 'gpt-5-mini' },
      [
        systemPrompt('Return JSON only.', {
          responseFormat: {
            type: 'json_schema',
            responseSchemaJson: schemaJson,
            strict: false,
          },
        }),
        userPrompt('hello'),
      ]
    )
  );

  t.true(error instanceof CopilotPromptInvalid);
  t.is(capturedRequest, undefined);
});

test('getActiveProviderMiddleware should merge defaults with profile override', t => {
  const provider = createProvider({
    rust: { request: ['clamp_max_tokens'] },
    node: { text: ['thinking_format'] },
  });

  const middleware = provider.exposeMiddleware(createExecution(provider));

  t.snapshot(middleware);
});

test('llmMatchModelCapabilities should honor structured attachment capability and remote rules', t => {
  const contract = parseCapabilityMatchRequest({
    models: [
      {
        id: 'structured-file',
        capabilities: [
          {
            input: ['text', 'file'],
            output: ['structured'],
            attachments: {
              kinds: ['image'],
              sourceKinds: ['url'],
              allowRemoteUrls: true,
            },
            structuredAttachments: {
              kinds: ['file'],
              sourceKinds: ['file_handle'],
              allowRemoteUrls: false,
            },
            defaultForOutputType: true,
          },
        ],
      },
    ],
    cond: {
      modelId: 'structured-file',
      outputType: 'structured',
      inputTypes: ['text', 'file'],
      attachmentKinds: ['file'],
      attachmentSourceKinds: ['file_handle'],
      hasRemoteAttachments: false,
    },
  });

  const modelId = llmMatchModelCapabilities(
    contract.models.map(model => ({
      ...model,
      capabilities: model.capabilities.map(capability => ({
        ...capability,
        input: capability.input.map(input => input as ModelInputType),
        output: capability.output.map(output => output as ModelOutputType),
      })),
    })),
    {
      modelId: contract.cond.modelId,
      outputType: contract.cond.outputType as ModelOutputType,
      inputTypes: contract.cond.inputTypes as ModelInputType[],
      attachmentKinds: contract.cond.attachmentKinds,
      attachmentSourceKinds: contract.cond.attachmentSourceKinds,
      hasRemoteAttachments: contract.cond.hasRemoteAttachments,
    }
  );

  t.is(modelId, 'structured-file');
  t.is(
    llmMatchModelCapabilities(
      [
        {
          id: 'structured-file',
          capabilities: [
            {
              input: [ModelInputType.Text, ModelInputType.File],
              output: [ModelOutputType.Structured],
              structuredAttachments: {
                kinds: ['file'],
                sourceKinds: ['file_handle'],
                allowRemoteUrls: false,
              },
              defaultForOutputType: true,
            },
          ],
        },
      ],
      {
        modelId: 'structured-file',
        outputType: ModelOutputType.Structured,
        inputTypes: [ModelInputType.Text, ModelInputType.File],
        attachmentKinds: ['file'],
        attachmentSourceKinds: ['url'],
        hasRemoteAttachments: true,
      }
    ),
    undefined
  );
});

test('llmMatchModelCapabilities should cover capability matrix combinations', t => {
  const models: CopilotProviderModel[] = [
    {
      id: 'text-default',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Text],
          defaultForOutputType: true,
        },
      ],
    },
    {
      id: 'vision-remote',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text],
          attachments: {
            kinds: ['image'],
            sourceKinds: ['url'],
            allowRemoteUrls: true,
          },
        },
      ],
    },
    {
      id: 'structured-file',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.File],
          output: [ModelOutputType.Structured],
          structuredAttachments: {
            kinds: ['file'],
            sourceKinds: ['file_handle'],
            allowRemoteUrls: false,
          },
          defaultForOutputType: true,
        },
      ],
    },
  ];

  const cases: Array<{
    title: string;
    cond: ModelFullConditions;
    expected?: string;
  }> = [
    {
      title: 'default text model',
      cond: {
        outputType: ModelOutputType.Text,
        inputTypes: [ModelInputType.Text],
      },
      expected: 'text-default',
    },
    {
      title: 'explicit multimodal override',
      cond: {
        modelId: 'vision-remote',
        outputType: ModelOutputType.Text,
        inputTypes: [ModelInputType.Text, ModelInputType.Image],
        attachmentKinds: ['image'],
        attachmentSourceKinds: ['url'],
        hasRemoteAttachments: true,
      },
      expected: 'vision-remote',
    },
    {
      title: 'structured file capability',
      cond: {
        outputType: ModelOutputType.Structured,
        inputTypes: [ModelInputType.Text, ModelInputType.File],
        attachmentKinds: ['file'],
        attachmentSourceKinds: ['file_handle'],
      },
      expected: 'structured-file',
    },
    {
      title: 'remote attachment rejected when capability is stricter',
      cond: {
        modelId: 'structured-file',
        outputType: ModelOutputType.Structured,
        inputTypes: [ModelInputType.Text, ModelInputType.File],
        attachmentKinds: ['file'],
        attachmentSourceKinds: ['url'],
        hasRemoteAttachments: true,
      },
      expected: undefined,
    },
  ];

  for (const entry of cases) {
    t.is(
      llmMatchModelCapabilities(models, entry.cond),
      entry.expected,
      entry.title
    );
  }
});

test('checkParams should infer remote image capability from url extension without host mime inference', async t => {
  const provider = new TestOpenAIProvider();

  const cond = await provider.checkParams({
    cond: {
      modelId: 'gpt-4.1',
      outputType: ModelOutputType.Text,
      inputTypes: [ModelInputType.Text],
    },
    messages: [
      {
        role: 'user',
        content: 'describe this image',
        attachments: ['https://example.com/cat.png'],
      },
    ],
  });

  t.snapshot({
    inputTypes: cond.inputTypes,
    attachmentKinds: cond.attachmentKinds,
    attachmentSourceKinds: cond.attachmentSourceKinds,
  });
  t.is(cond.hasRemoteAttachments, true);
});

test('llmResolveRequestedModelMatch should preserve provider-prefixed optional matches', t => {
  const request = parseRequestedModelMatchRequest({
    providerIds: ['openai-default', 'gemini-default'],
    defaultModel: 'gemini-2.5-flash',
    optionalModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    requestedModelId: 'openai-default/gemini-2.5-pro',
  });

  t.snapshot(llmResolveRequestedModelMatch(request), 'prefixed optional hit');
  t.snapshot(
    llmResolveRequestedModelMatch({
      ...request,
      requestedModelId: 'openai-default/not-in-optional',
    }),
    'prefixed optional miss'
  );
});

test('CopilotProviderFactory should resolve legacy model ids through native registry without migration', async t => {
  const provider = createProvider();
  const registryService = {
    getRegistry: () =>
      buildProviderRegistry({
        profiles: [
          {
            id: 'openai-main',
            type: CopilotProviderType.OpenAI,
            config: { apiKey: 'test-key' },
          },
        ],
        defaults: {},
        openai: { apiKey: 'test-key' },
      }),
  };
  const server = {
    enableFeature: Sinon.stub(),
    disableFeature: Sinon.stub(),
  };
  const access = {
    resolveRouteAccess: Sinon.stub().resolves({
      byokProfiles: [],
      quotaBackedRoutesAvailable: true,
    }),
  };
  const factory = new CopilotProviderFactory(
    server as never,
    registryService as never,
    access as never
  );
  factory.register('openai-main', provider);

  const resolvedProvider = await factory.getProviderByModel('gpt-5-2025-08-07');
  t.is(resolvedProvider, provider);
  t.is(provider.resolveModel('gpt-5-2025-08-07')?.id, 'gpt-5');
});

const BYOK_OPENAI_PROFILE: CopilotProviderProfile = {
  id: 'byok-aaaaaaaaaaaa-openai-server-key1',
  type: CopilotProviderType.OpenAI,
  priority: 10_000,
  config: { apiKey: 'byok-key' },
};

const BYOK_FAL_PROFILE: CopilotProviderProfile = {
  id: 'byok-aaaaaaaaaaaa-fal-server-key1',
  type: CopilotProviderType.FAL,
  priority: 10_000,
  config: { apiKey: 'byok-key' },
};

function createProviderFactoryWithByokRoutes({
  byokProfiles = [BYOK_OPENAI_PROFILE],
  hasQuota = true,
}: {
  byokProfiles?: CopilotProviderProfile[];
  hasQuota?: boolean;
} = {}) {
  const provider = createProvider();
  const registryService = {
    getRegistry: () =>
      buildProviderRegistry({
        profiles: [
          {
            id: 'openai-main',
            type: CopilotProviderType.OpenAI,
            priority: 1,
            config: { apiKey: 'test-key' },
          },
        ],
        defaults: {},
      }),
  };
  const server = {
    enableFeature: Sinon.stub(),
    disableFeature: Sinon.stub(),
  };
  const byok = {
    getProfiles: Sinon.stub().resolves(byokProfiles),
  };
  const access = {
    resolveRouteAccess: Sinon.stub().callsFake(async context => ({
      byokProfiles: await byok.getProfiles(context),
      quotaBackedRoutesAvailable: context.quotaBackedRoutesAllowed ?? hasQuota,
    })),
  };
  const factory = new CopilotProviderFactory(
    server as never,
    registryService as never,
    access as never
  );
  factory.register('openai-main', provider);

  return { factory, byok };
}

test('CopilotProviderFactory should use matching BYOK routes before quota-backed routes', async t => {
  const { factory } = createProviderFactoryWithByokRoutes();

  const routes = await factory.resolveRoutes(
    { modelId: 'gpt-5-mini', outputType: ModelOutputType.Text },
    {},
    { userId: 'user-1', workspaceId: 'workspace-1' }
  );

  t.deepEqual(
    routes.map(route => route.providerId),
    ['byok-aaaaaaaaaaaa-openai-server-key1']
  );
});

test('CopilotProviderFactory should skip unsupported BYOK profiles and use quota-backed fallback', async t => {
  const { factory } = createProviderFactoryWithByokRoutes({
    byokProfiles: [BYOK_FAL_PROFILE],
  });

  const routes = await factory.resolveRoutes(
    { modelId: 'gpt-5-mini', outputType: ModelOutputType.Text },
    {},
    { userId: 'user-1', workspaceId: 'workspace-1' }
  );

  t.deepEqual(
    routes.map(route => route.providerId),
    ['openai-main']
  );
});

test('CopilotProviderFactory should resolve BYOK embedding routes with workspace context', async t => {
  const { factory, byok } = createProviderFactoryWithByokRoutes();

  const routes = await factory.resolveRoutes(
    {
      modelId: 'text-embedding-3-small',
      outputType: ModelOutputType.Embedding,
    },
    {},
    { workspaceId: 'workspace-1', featureKind: 'workspace_indexing' }
  );

  t.deepEqual(
    routes.map(route => route.providerId),
    ['byok-aaaaaaaaaaaa-openai-server-key1']
  );
  Sinon.assert.calledOnceWithMatch(byok.getProfiles, {
    workspaceId: 'workspace-1',
    featureKind: 'workspace_indexing',
  });
});

test('CopilotProviderFactory should treat embedding preparation as embedding feature by default', async t => {
  const { factory, byok } = createProviderFactoryWithByokRoutes();

  await factory.prepareEmbeddingRoutes('text-embedding-3-small', 'hello', {
    workspace: 'workspace-1',
  });

  t.true(byok.getProfiles.calledOnce);
  Sinon.assert.calledOnceWithMatch(byok.getProfiles, {
    workspaceId: 'workspace-1',
    featureKind: 'embedding',
  });
});

test('CopilotProviderFactory should resolve BYOK rerank routes before quota-backed routes', async t => {
  const { factory, byok } = createProviderFactoryWithByokRoutes();

  const preparedRoutes = await factory.prepareRerankRoutes(
    'gpt-4o-mini',
    {
      query: 'programming',
      candidates: [{ text: 'React is a UI library.' }],
    },
    { workspace: 'workspace-1' }
  );
  const resolvedRoutes = await factory.resolveRoutes(
    { modelId: 'gpt-4o-mini', outputType: ModelOutputType.Rerank },
    {},
    { workspaceId: 'workspace-1', featureKind: 'rerank' }
  );

  t.deepEqual(
    preparedRoutes.map(route => route.providerId),
    []
  );
  t.deepEqual(
    resolvedRoutes.map(route => route.providerId),
    ['byok-aaaaaaaaaaaa-openai-server-key1']
  );
  Sinon.assert.calledWithMatch(byok.getProfiles, {
    workspaceId: 'workspace-1',
    featureKind: 'rerank',
  });
});

test('CopilotProviderFactory should treat image preparation as image feature by default', async t => {
  const { factory, byok } = createProviderFactoryWithByokRoutes();

  await factory.prepareImageRoutes(
    { modelId: 'gpt-image-1', outputType: ModelOutputType.Image },
    singleUserPromptMessages('draw a cat'),
    { workspace: 'workspace-1' }
  );

  t.true(byok.getProfiles.calledOnce);
  Sinon.assert.calledOnceWithMatch(byok.getProfiles, {
    workspaceId: 'workspace-1',
    featureKind: 'image',
  });
});

test('CopilotProviderFactory should omit quota-backed routes when quota is exhausted', async t => {
  const { factory } = createProviderFactoryWithByokRoutes({ hasQuota: false });

  const routes = await factory.resolveRoutes(
    { modelId: 'gpt-5-mini', outputType: ModelOutputType.Text },
    {},
    { userId: 'user-1', workspaceId: 'workspace-1' }
  );

  t.deepEqual(
    routes.map(route => route.providerId),
    ['byok-aaaaaaaaaaaa-openai-server-key1']
  );
});

test('CopilotProviderFactory should raise quota exceeded when only quota-backed routes match', async t => {
  const { factory } = createProviderFactoryWithByokRoutes({
    byokProfiles: [],
    hasQuota: false,
  });

  await t.throwsAsync(
    factory.resolveRoutes(
      { modelId: 'gpt-5-mini', outputType: ModelOutputType.Text },
      {},
      { userId: 'user-1', workspaceId: 'workspace-1' }
    ),
    { instanceOf: CopilotQuotaExceeded }
  );
});

test('CopilotProviderFactory should not report quota exhausted when quota-backed routes are disabled', async t => {
  const { factory } = createProviderFactoryWithByokRoutes({
    byokProfiles: [],
    hasQuota: true,
  });

  const routes = await factory.resolveRoutes(
    { modelId: 'gpt-5-mini', outputType: ModelOutputType.Text },
    {},
    {
      userId: 'user-1',
      workspaceId: 'workspace-1',
      quotaBackedRoutesAllowed: false,
    }
  );

  t.deepEqual(routes, []);
});

test('selectModel should reject unknown models without online fallback', t => {
  const provider = new TestOpenAIProvider();
  t.is(provider.resolveModel('online-preview'), undefined);

  const error = t.throws(() =>
    provider.selectModel({
      modelId: 'online-preview',
      outputType: ModelOutputType.Text,
    })
  );

  t.truthy(error);
  t.regex((error as Error).message, /does not support|No model supports/);
});

test('OpenAI oldApiStyle should resolve chat backend variants from native registry', async t => {
  class LegacyOpenAIProvider extends OpenAIProvider {
    override get config() {
      return {
        apiKey: 'test-key',
        baseURL: 'https://api.openai.com/v1',
        oldApiStyle: true,
      };
    }

    override configured() {
      return true;
    }
  }

  const provider = new LegacyOpenAIProvider();
  (provider as any).toolExecutorHost = {
    createNativeAdapter: () => {
      throw new Error('native adapter should not be used');
    },
    getTools: async () => ({}),
  };

  const prepared = await getProviderRuntimeHost(provider).prepare.chat(
    'text',
    {
      modelId: 'o3',
    },
    singleUserPromptMessages('hello')
  );

  t.is(prepared?.route.model, 'o3');
  t.is(prepared?.route.protocol, 'openai_chat');
  t.is(prepared?.route.requestLayer, 'chat_completions');
});

test('OpenAI image driver should host-materialize remote edit inputs', async t => {
  const provider = new OpenAIProvider();
  (provider as any).AFFiNEConfig = {
    copilot: {
      providers: {
        profiles: [],
        defaults: {},
        openai: { apiKey: 'test-key' },
      },
    },
  };
  (provider as any).attachmentAdmissionHost = {
    admitPromptAttachment: async (_attachment: unknown, context: any) => {
      t.is(context.userId, 'user-1');
      t.is(context.workspaceId, 'workspace-1');
      t.is(context.sessionId, 'session-1');
      return {
        id: 'att_1',
        kind: 'bytes',
        mimeType: 'image/png',
        size: 5,
        hash: 'hash',
        data: 'aW1hZ2U=',
        encoding: 'base64',
      };
    },
  };
  const driver = provider.getExecutionDrivers()?.image;
  const messages = await driver?.prepareMessages?.(
    [
      {
        role: 'user',
        content: 'edit this',
        attachments: ['https://example.com/input.png'],
      },
    ],
    { base_url: 'https://api.openai.com', auth_token: 'test-key' },
    { user: 'user-1', workspace: 'workspace-1', session: 'session-1' }
  );

  t.deepEqual(messages?.[0].attachments, [
    {
      kind: 'bytes',
      data: 'aW1hZ2U=',
      encoding: 'base64',
      mimeType: 'image/png',
      fileName: undefined,
      providerHint: undefined,
    },
  ]);
});

test('OpenAI native request should preserve caller sampling options and defer compatibility to rust middleware', async t => {
  const provider = createProvider();
  const middleware = provider.exposeMiddleware(createExecution(provider));

  const { request } = await buildNativeRequest({
    model: 'gpt-5.4',
    messages: singleUserPromptMessages('hello'),
    options: {
      temperature: 0.7,
      topP: 0.8,
      presencePenalty: 0.2,
      frequencyPenalty: 0.1,
      maxTokens: 128,
    },
    middleware,
  });

  t.is(request.temperature, 0.7);
  t.is(request.middleware, undefined);
});

test('ExecutionPlan should serialize routed request state and reject host-only signal', t => {
  const plan = parseExecutionPlan({
    routes: [
      {
        providerId: 'openai-main',
        protocol: 'openai_chat',
        model: 'gpt-5-mini',
        backendConfig: {
          base_url: 'https://api.openai.com/v1',
          auth_token: 'test-key',
        },
      },
    ],
    request: {
      kind: 'text',
      cond: { modelId: 'gpt-5-mini', outputType: ModelOutputType.Text },
      messages: singleUserPromptMessages('hello'),
      options: { temperature: 0.3, reasoning: true },
    },
    transport: {
      kind: 'chat',
      request: {
        model: 'gpt-5-mini',
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'hello' }],
          },
        ],
      },
    },
    routePolicy: { fallbackOrder: ['openai-main'] },
    runtimePolicy: { prefer: CopilotProviderType.OpenAI, maxSteps: 4 },
    attachmentPolicy: { materializeRemoteAttachments: true },
    responsePostprocess: { mode: 'text' },
    hostContext: { currentMessages: singleUserPromptMessages('hello') },
  });

  t.snapshot({
    fallbackOrder: plan.routePolicy.fallbackOrder,
    transport: plan.transport,
  });

  const error = t.throws(() =>
    parseExecutionPlan({
      ...plan,
      request: {
        kind: 'text',
        cond: { modelId: 'gpt-5-mini' },
        messages: singleUserPromptMessages('hello'),
        options: { signal: new AbortController().signal },
      },
    })
  );

  t.truthy(error);

  const hostContextError = t.throws(() =>
    parseExecutionPlan({
      ...plan,
      hostContext: {
        currentMessages: singleUserPromptMessages('hello'),
        currentSessionId: 'session-1',
      },
    })
  );

  t.truthy(hostContextError);
});

test('ProviderDriverSpec should freeze declarative driver shape', t => {
  const spec = parseProviderDriverSpec({
    driverId: 'openai-default',
    providerType: CopilotProviderType.OpenAI,
    models: ['gpt-5-mini'],
    routes: [
      {
        kind: 'text',
        protocol: 'openai_chat',
        requestLayer: 'chat_completions',
        supportsNativeFallback: true,
        requestMiddlewares: ['normalize_messages', 'openai_request_compat'],
        streamMiddlewares: ['stream_event_normalize'],
      },
    ],
    hostOnly: {
      errorMapper: 'openai',
      structuredRetry: true,
    },
  });

  t.is(spec.routes[0]?.kind, 'text');

  const error = t.throws(() =>
    parseProviderDriverSpec({
      ...spec,
      routes: [
        {
          kind: 'text',
          protocol: 'openai_chat',
          passthroughHelper: 'not-allowed',
        },
      ],
    })
  );

  t.truthy(error);
});

test('NativeExecutionEngine should dispatch prepared text routes through native fallback', async t => {
  const engine = createNativeExecutionEngine();
  const registry = buildProviderRegistry({
    profiles: [
      {
        id: 'openai-primary',
        type: CopilotProviderType.OpenAI,
        config: { apiKey: '1' },
      },
      {
        id: 'openai-fallback',
        type: CopilotProviderType.OpenAI,
        config: { apiKey: '2' },
      },
    ],
  });
  const primaryProfile = registry.profiles.get('openai-primary');
  const fallbackProfile = registry.profiles.get('openai-fallback');
  if (!primaryProfile || !fallbackProfile) {
    throw new Error('missing test provider profiles');
  }

  let capturedRoutes: unknown;
  let called = false;
  const original = (serverNativeModule as any).llmDispatchPrepared;
  (serverNativeModule as any).llmDispatchPrepared = (routesJson: string) => {
    called = true;
    capturedRoutes = JSON.parse(routesJson);
    return JSON.stringify({
      provider_id: 'openai-fallback',
      response: {
        id: 'chat_2',
        model: 'gpt-5-mini',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'fallback-ok' }],
        },
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
        finish_reason: 'stop',
      },
    });
  };
  t.teardown(() => {
    (serverNativeModule as any).llmDispatchPrepared = original;
  });

  const result = await engine.execute({
    nativeDispatch: {
      chat: {
        routes: [
          nativeRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
            request: nativeTextRequest('hello from primary'),
          }),
          nativeRoute({
            providerId: 'openai-fallback',
            authToken: 'fallback-key',
            protocol: 'gemini',
            baseUrl: GEMINI_BASE_URL,
            request: nativeTextRequest('hello from fallback'),
          }),
        ],
        prepared: {
          route: preparedRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
          }),
          request: nativeTextRequest('hello from primary'),
          tools: {},
          postprocess: { nodeTextMiddleware: [] },
        },
        hasTools: false,
      },
    },
    request: {
      kind: 'text',
      cond: { modelId: 'gpt-5-mini' },
      messages: singleUserPromptMessages('hello'),
      options: undefined,
    },
    routePolicy: { fallbackOrder: ['openai-primary', 'openai-fallback'] },
    runtimePolicy: {},
    attachmentPolicy: { materializeRemoteAttachments: true },
    responsePostprocess: { mode: 'text' },
    hostPersistence: { persistAssistantTurn: true, outputKind: 'text' },
    hostContext: {
      currentMessages: singleUserPromptMessages('hello'),
    },
  });

  t.is(result, 'fallback-ok');
  t.true(called);
  t.snapshot(summarizePreparedDispatchRoutes(capturedRoutes));
});

test('NativeExecutionEngine should record single BYOK route dispatch failure', async t => {
  const byok = {
    recordProviderFailure: Sinon.stub().resolves(),
    recordUsage: Sinon.stub().resolves(),
  };
  const engine = new NativeExecutionEngine(byok as never);
  const providerId = 'byok-aaaaaaaaaaaa-openai-server-key1';

  const original = (serverNativeModule as any).llmDispatchPrepared;
  (serverNativeModule as any).llmDispatchPrepared = () => {
    throw new Error('401 invalid sk-test-primary');
  };
  t.teardown(() => {
    (serverNativeModule as any).llmDispatchPrepared = original;
  });

  const error = await t.throwsAsync(
    engine.execute({
      nativeDispatch: {
        chat: {
          routes: [
            nativeRoute({
              providerId,
              authToken: 'primary-key',
              request: nativeTextRequest('hello'),
            }),
          ],
          prepared: {
            route: preparedRoute({
              providerId,
              authToken: 'primary-key',
            }),
            request: nativeTextRequest('hello'),
            tools: {},
            postprocess: { nodeTextMiddleware: [] },
          },
          hasTools: false,
        },
      },
      request: {
        kind: 'text',
        cond: { modelId: 'gpt-5-mini' },
        messages: singleUserPromptMessages('hello'),
        options: {
          workspace: 'workspace-1',
          user: 'user-1',
          session: 'session-1',
          featureKind: 'chat',
        },
      },
      routePolicy: { fallbackOrder: [providerId] },
      runtimePolicy: {},
      attachmentPolicy: { materializeRemoteAttachments: true },
      responsePostprocess: { mode: 'text' },
      hostPersistence: { persistAssistantTurn: true, outputKind: 'text' },
      hostContext: {
        currentMessages: singleUserPromptMessages('hello'),
      },
    })
  );

  t.truthy(error);
  Sinon.assert.calledOnceWithMatch(byok.recordProviderFailure, {
    workspaceId: 'workspace-1',
    providerId,
    featureKind: 'chat',
  });
  Sinon.assert.notCalled(byok.recordUsage);
});

test('NativeExecutionEngine should reject single-route plans when no native route is prepared', async t => {
  const engine = createNativeExecutionEngine();

  const error = await t.throwsAsync(
    engine.execute({
      request: {
        kind: 'text',
        cond: { modelId: 'gpt-5-mini' },
        messages: promptMessages(userPrompt('hello')),
        options: undefined,
      },
      routePolicy: { fallbackOrder: ['openai-primary'] },
      runtimePolicy: {},
      attachmentPolicy: { materializeRemoteAttachments: true },
      responsePostprocess: { mode: 'text' },
      hostPersistence: { persistAssistantTurn: true, outputKind: 'text' },
      hostContext: {
        currentMessages: singleUserPromptMessages('hello'),
      },
    }),
    {
      instanceOf: NoCopilotProviderAvailable,
    }
  );

  t.true(error instanceof NoCopilotProviderAvailable);
});

test('NativeExecutionEngine should prefer prepared native fallback dispatch for explicit routes', async t => {
  const engine = createNativeExecutionEngine();
  let capturedRoutes: unknown;
  let called = false;

  const original = (serverNativeModule as any).llmDispatchPrepared;
  (serverNativeModule as any).llmDispatchPrepared = (routesJson: string) => {
    called = true;
    capturedRoutes = JSON.parse(routesJson);
    return JSON.stringify({
      provider_id: 'openai-fallback',
      response: {
        id: 'chat_1',
        model: 'gpt-5-mini',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'native-fallback-ok' }],
        },
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
        finish_reason: 'stop',
      },
    });
  };
  t.teardown(() => {
    (serverNativeModule as any).llmDispatchPrepared = original;
  });

  const result = await engine.execute({
    nativeDispatch: {
      chat: {
        routes: [
          nativeRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
            request: nativeTextRequest('hello'),
          }),
          nativeRoute({
            providerId: 'openai-fallback',
            authToken: 'fallback-key',
            request: nativeTextRequest('hello'),
          }),
        ],
        prepared: {
          route: preparedRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
          }),
          request: nativeTextRequest('hello'),
          tools: {},
          postprocess: {
            nodeTextMiddleware: [],
          },
        },
        hasTools: false,
      },
    },
    request: {
      kind: 'text',
      cond: { modelId: 'gpt-5-mini' },
      messages: singleUserPromptMessages('hello'),
      options: undefined,
    },
    routePolicy: { fallbackOrder: ['openai-primary'] },
    runtimePolicy: {},
    attachmentPolicy: { materializeRemoteAttachments: true },
    responsePostprocess: { mode: 'text' },
    hostPersistence: { persistAssistantTurn: true, outputKind: 'text' },
    hostContext: {},
  });

  t.is(result, 'native-fallback-ok');
  t.true(called);
  t.snapshot(summarizePreparedDispatchRoutes(capturedRoutes));
});

test('NativeExecutionEngine should stream through prepared native fallback dispatch', async t => {
  const engine = createNativeExecutionEngine();
  let called = false;

  const original = (serverNativeModule as any).llmDispatchPreparedStream;
  (serverNativeModule as any).llmDispatchPreparedStream = (
    _routesJson: string,
    callback: (error: Error | null, arg: string) => void
  ) => {
    called = true;
    callback(
      null,
      JSON.stringify({ type: 'text_delta', text: 'stream-native-ok' })
    );
    callback(null, '__AFFINE_LLM_STREAM_END__');
    return { abort() {} };
  };
  t.teardown(() => {
    (serverNativeModule as any).llmDispatchPreparedStream = original;
  });

  const chunks: string[] = [];
  for await (const chunk of engine.executeStream({
    nativeDispatch: {
      chat: {
        routes: [
          nativeRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
            request: nativeTextRequest('hello'),
          }),
          nativeRoute({
            providerId: 'openai-fallback',
            authToken: 'fallback-key',
            request: nativeTextRequest('hello'),
          }),
        ],
        prepared: {
          route: preparedRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
          }),
          request: nativeTextRequest('hello'),
          tools: {},
          postprocess: {
            nodeTextMiddleware: [],
          },
        },
        hasTools: false,
      },
    },
    request: {
      kind: 'streamText',
      cond: { modelId: 'gpt-5-mini' },
      messages: promptMessages(userPrompt('hello')),
      options: undefined,
    },
    routePolicy: { fallbackOrder: ['openai-primary'] },
    runtimePolicy: {},
    attachmentPolicy: { materializeRemoteAttachments: true },
    responsePostprocess: { mode: 'streamText' },
    hostPersistence: {
      persistAssistantTurn: true,
      outputKind: 'streamText',
    },
    hostContext: {},
  })) {
    chunks.push(chunk);
  }

  t.true(called);
  t.deepEqual(chunks, ['stream-native-ok']);
});

test('ExecutionPlanBuilder should keep tool-loop chat routes on prepared dispatch path', async t => {
  const provider = new TestOpenAIProvider();
  const toolSchema = {
    answer: {
      name: 'answer',
      description: 'Answer',
      parameters: {
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
        required: ['value'],
      },
    },
  };
  const noopTool = {
    answer: defineTool({
      description: 'Answer',
      inputSchema: z.object({ value: z.string() }),
      execute: async () => ({ ok: true }),
    }),
  };
  const providers = {
    prepareRoutes: Sinon.stub().resolves([
      {
        providerId: 'openai-primary',
        provider,
        execution: { providerId: 'openai-primary', profile: {} as any },
        profile: {} as any,
        modelId: 'gpt-5-mini',
        prepared: {
          route: preparedRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
          }),
          request: {
            ...nativeTextRequest('hello'),
            tools: [toolSchema.answer],
          } as LlmRequest,
          tools: noopTool,
          maxSteps: 4,
          postprocess: {
            nodeTextMiddleware: [],
          },
        },
      },
      {
        providerId: 'openai-fallback',
        provider,
        execution: { providerId: 'openai-fallback', profile: {} as any },
        profile: {} as any,
        modelId: 'gpt-5-mini',
        prepared: {
          route: preparedRoute({
            providerId: 'openai-fallback',
            authToken: 'fallback-key',
            protocol: 'gemini',
            baseUrl: GEMINI_BASE_URL,
          }),
          request: {
            ...nativeTextRequest('hello'),
            tools: [toolSchema.answer],
          } as LlmRequest,
          tools: noopTool,
          maxSteps: 4,
          postprocess: {
            nodeTextMiddleware: [],
          },
        },
      },
    ]),
  };
  const metrics = { recordPlan: Sinon.stub() };
  const builder = new ExecutionPlanBuilder(
    providers as never,
    metrics as never
  );

  const plan = await builder.buildTextPlan({ modelId: 'gpt-5-mini' }, [
    userPrompt('hello'),
  ]);

  t.is(plan.nativeDispatch?.chat?.routes.length, 2);
  t.true(plan.nativeDispatch?.chat?.hasTools ?? false);
  t.snapshot({
    transport: plan.transport,
    preparedTools: plan.nativeDispatch?.chat?.prepared.request.tools?.map(
      tool => tool.name
    ),
  });
});

test('ExecutionPlanBuilder should keep single-route tool chat plans on prepared_routes path', async t => {
  const provider = new TestOpenAIProvider();
  const toolSchema = {
    answer: {
      name: 'answer',
      description: 'Answer',
      parameters: {
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
        required: ['value'],
      },
    },
  };
  const noopTool = {
    answer: defineTool({
      description: 'Answer',
      inputSchema: z.object({ value: z.string() }),
      execute: async () => ({ ok: true }),
    }),
  };
  const providers = {
    prepareRoutes: Sinon.stub().resolves([
      {
        providerId: 'openai-primary',
        provider,
        execution: { providerId: 'openai-primary', profile: {} as any },
        profile: {} as any,
        modelId: 'gpt-5-mini',
        prepared: {
          route: preparedRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
          }),
          request: {
            ...nativeTextRequest('hello'),
            tools: [toolSchema.answer],
          } as LlmRequest,
          tools: noopTool,
          maxSteps: 4,
          postprocess: {
            nodeTextMiddleware: [],
          },
        },
      },
    ]),
  };
  const metrics = { recordPlan: Sinon.stub() };
  const builder = new ExecutionPlanBuilder(
    providers as never,
    metrics as never
  );

  const plan = await builder.buildTextPlan({ modelId: 'gpt-5-mini' }, [
    userPrompt('hello'),
  ]);

  t.is(plan.nativeDispatch?.chat?.routes.length, 1);
  t.true(plan.nativeDispatch?.chat?.hasTools ?? false);
  t.snapshot(plan.transport);
});

test('NativeExecutionEngine should route tool-loop chat prepared routes through native dispatch', async t => {
  const engine = createNativeExecutionEngine();
  let capturedRoutes: unknown;
  let called = false;
  let toolCallbackCount = 0;

  const original = (serverNativeModule as any)
    .llmDispatchToolLoopStreamPrepared;
  (serverNativeModule as any).llmDispatchToolLoopStreamPrepared = async (
    routesJson: string,
    maxSteps: number,
    callback: (error: Error | null, eventJson: string) => void,
    toolCallback: (error: Error | null, requestJson: string) => Promise<string>
  ) => {
    called = true;
    capturedRoutes = JSON.parse(routesJson);
    t.is(maxSteps, 4);

    const toolResult = JSON.parse(
      await toolCallback(
        null,
        JSON.stringify({
          callId: 'call_1',
          name: 'answer',
          args: { value: 'native-tool-ok' },
        })
      )
    ) as {
      callId: string;
      name: string;
      args: Record<string, unknown>;
      output: unknown;
      isError?: boolean;
    };
    toolCallbackCount += 1;

    callback(
      null,
      JSON.stringify({
        type: 'tool_call',
        call_id: 'call_1',
        name: 'answer',
        arguments: { value: 'native-tool-ok' },
      })
    );
    callback(
      null,
      JSON.stringify({
        type: 'tool_result',
        call_id: 'call_1',
        name: toolResult.name,
        arguments: toolResult.args,
        output: toolResult.output,
      })
    );
    callback(
      null,
      JSON.stringify({ type: 'text_delta', text: 'native-tool-ok' })
    );
    callback(null, JSON.stringify({ type: 'done' }));
    callback(null, '__AFFINE_LLM_STREAM_END__');

    return { abort() {} };
  };
  t.teardown(() => {
    (serverNativeModule as any).llmDispatchToolLoopStreamPrepared = original;
  });

  const result = await engine.execute({
    nativeDispatch: {
      chat: {
        routes: [
          nativeRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
            request: {
              ...nativeTextRequest('hello'),
              tools: [
                {
                  name: 'answer',
                  parameters: {
                    type: 'object',
                    properties: { value: { type: 'string' } },
                    required: ['value'],
                  },
                },
              ],
            },
          }),
          nativeRoute({
            providerId: 'openai-fallback',
            authToken: 'fallback-key',
            protocol: 'gemini',
            baseUrl: GEMINI_BASE_URL,
            request: {
              ...nativeTextRequest('hello from fallback'),
              tools: [
                {
                  name: 'answer',
                  parameters: {
                    type: 'object',
                    properties: { value: { type: 'string' } },
                    required: ['value'],
                  },
                },
              ],
            },
          }),
        ],
        prepared: {
          route: preparedRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
          }),
          request: {
            ...nativeTextRequest('hello'),
            tools: [
              {
                name: 'answer',
                parameters: {
                  type: 'object',
                  properties: {
                    value: { type: 'string' },
                  },
                  required: ['value'],
                },
              },
            ],
          },
          tools: {
            answer: defineTool({
              description: 'Answer',
              inputSchema: z.object({ value: z.string() }),
              execute: async args => ({ value: String(args.value) }),
            }),
          },
          maxSteps: 4,
          postprocess: {
            nodeTextMiddleware: [],
          },
        },
        hasTools: true,
      },
    },
    request: {
      kind: 'text',
      cond: { modelId: 'gpt-5-mini' },
      messages: singleUserPromptMessages('hello'),
      options: undefined,
    },
    routePolicy: { fallbackOrder: ['openai-primary'] },
    runtimePolicy: {},
    attachmentPolicy: { materializeRemoteAttachments: true },
    responsePostprocess: { mode: 'text' },
    hostPersistence: { persistAssistantTurn: true, outputKind: 'text' },
    hostContext: {
      currentMessages: singleUserPromptMessages('hello'),
    },
  });

  t.is(result, 'native-tool-ok');
  t.true(called);
  t.is(toolCallbackCount, 1);
  t.snapshot(summarizePreparedDispatchRoutes(capturedRoutes));
});

test('ExecutionPlanBuilder should build native prepared routes for structured, image, embedding and rerank', async t => {
  const provider = new TestOpenAIProvider();
  const providers = {
    prepareStructuredRoutes: Sinon.stub().resolves([
      {
        providerId: 'openai-primary',
        provider,
        execution: { providerId: 'openai-primary', profile: {} as any },
        profile: {} as any,
        modelId: 'gpt-5-mini',
        preparedStructured: {
          route: preparedRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
          }),
          request: nativeStructuredRequest('hello', {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
          }),
        },
      },
      {
        providerId: 'openai-fallback',
        provider,
        execution: { providerId: 'openai-fallback', profile: {} as any },
        profile: {} as any,
        modelId: 'gpt-5-mini',
        preparedStructured: {
          route: preparedRoute({
            providerId: 'openai-fallback',
            authToken: 'fallback-key',
          }),
          request: nativeStructuredRequest('hello', {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
          }),
        },
      },
    ]),
    prepareEmbeddingRoutes: Sinon.stub().resolves([
      {
        providerId: 'openai-primary',
        provider,
        execution: { providerId: 'openai-primary', profile: {} as any },
        profile: {} as any,
        modelId: 'text-embedding-3-small',
        preparedEmbedding: {
          route: preparedRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
            model: 'text-embedding-3-small',
          }),
          request: nativeEmbeddingRequest('hello'),
        },
      },
      {
        providerId: 'openai-fallback',
        provider,
        execution: { providerId: 'openai-fallback', profile: {} as any },
        profile: {} as any,
        modelId: 'text-embedding-3-small',
        preparedEmbedding: {
          route: preparedRoute({
            providerId: 'openai-fallback',
            authToken: 'fallback-key',
            model: 'text-embedding-3-small',
          }),
          request: nativeEmbeddingRequest('hello'),
        },
      },
    ]),
    prepareImageRoutes: Sinon.stub().resolves([
      {
        providerId: 'openai-default',
        provider,
        execution: { providerId: 'openai-default', profile: {} as any },
        profile: {} as any,
        modelId: 'gpt-image-1',
        preparedImage: {
          route: preparedRoute({
            providerId: 'openai-default',
            authToken: 'image-key',
            protocol: 'openai_images',
            model: 'gpt-image-1',
          }),
          request: nativeImageRequest('draw a cat'),
        },
      },
    ]),
    prepareRerankRoutes: Sinon.stub().resolves([
      {
        providerId: 'openai-primary',
        provider,
        execution: { providerId: 'openai-primary', profile: {} as any },
        profile: {} as any,
        modelId: 'gpt-4o-mini',
        preparedRerank: {
          route: preparedRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
            model: 'gpt-4o-mini',
          }),
          request: nativeRerankRequest('programming', [
            { text: 'React is a UI library.' },
          ]),
        },
      },
      {
        providerId: 'openai-fallback',
        provider,
        execution: { providerId: 'openai-fallback', profile: {} as any },
        profile: {} as any,
        modelId: 'gpt-4o-mini',
        preparedRerank: {
          route: preparedRoute({
            providerId: 'openai-fallback',
            authToken: 'fallback-key',
            model: 'gpt-4o-mini',
          }),
          request: nativeRerankRequest('programming', [
            { text: 'React is a UI library.' },
          ]),
        },
      },
    ]),
  };
  const metrics = { recordPlan: Sinon.stub() };
  const builder = new ExecutionPlanBuilder(
    providers as never,
    metrics as never
  );

  const structuredPlan = await builder.buildStructuredPlan(
    { modelId: 'gpt-5-mini' },
    singleUserPromptMessages('hello'),
    structuredOptions(z.object({ ok: z.boolean() })),
    undefined,
    structuredContract(z.object({ ok: z.boolean() }))
  );
  const imagePlan = await builder.buildImagePlan({ modelId: 'gpt-image-1' }, [
    userPrompt('draw a cat'),
  ]);
  const signal = new AbortController().signal;
  const embeddingPlan = await builder.buildEmbeddingPlan(
    'text-embedding-3-small',
    'hello',
    { signal, dimensions: 256 }
  );
  const rerankPlan = await builder.buildRerankPlan('gpt-4o-mini', {
    query: 'programming',
    candidates: [{ text: 'React is a UI library.' }],
  });

  t.snapshot({
    structured: {
      routes: structuredPlan.nativeDispatch?.structured?.routes.length,
      transport: structuredPlan.transport,
    },
    image: imagePlan.nativeDispatch?.image,
    embedding: {
      routes: embeddingPlan.nativeDispatch?.embedding?.routes.length,
      transport: embeddingPlan.transport,
    },
    rerank: {
      routes: rerankPlan.nativeDispatch?.rerank?.routes.length,
      transport: rerankPlan.transport,
    },
  });

  t.is(embeddingPlan.hostContext.signal, signal);
  t.truthy(embeddingPlan.serializable);
  const serializable = embeddingPlan.serializable!;
  t.deepEqual(serializable.request.options, {
    dimensions: 256,
  });
  t.is(serializable.routes.length, 2);
  t.deepEqual(serializable.routePolicy.fallbackOrder, [
    'openai-primary',
    'openai-fallback',
  ]);
});

test('NativeExecutionEngine should dispatch structured prepared routes through native execution', async t => {
  const engine = createNativeExecutionEngine();
  let capturedRoutes: unknown;
  let called = false;

  const original = (serverNativeModule as any).llmStructuredDispatchPrepared;
  (serverNativeModule as any).llmStructuredDispatchPrepared = (
    routesJson: string
  ) => {
    called = true;
    capturedRoutes = JSON.parse(routesJson);
    return JSON.stringify({
      provider_id: 'openai-fallback',
      response: {
        id: 'structured_1',
        model: 'gpt-5-mini',
        output_text: '{"ok":true}',
        output_json: { ok: true },
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
        finish_reason: 'stop',
      },
    });
  };
  t.teardown(() => {
    (serverNativeModule as any).llmStructuredDispatchPrepared = original;
  });

  const result = await engine.execute({
    nativeDispatch: {
      structured: {
        routes: [
          nativeRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
            request: nativeStructuredRequest('hello', {
              type: 'object',
              properties: { ok: { type: 'boolean' } },
              required: ['ok'],
            }),
          }),
          nativeRoute({
            providerId: 'openai-fallback',
            authToken: 'fallback-key',
            protocol: 'gemini',
            baseUrl: GEMINI_BASE_URL,
            request: nativeStructuredRequest('hello from fallback', {
              type: 'object',
              properties: { ok: { type: 'boolean' } },
              required: ['ok'],
            }),
          }),
        ],
        prepared: {
          route: preparedRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
          }),
          request: nativeStructuredRequest('hello', {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
          }),
        },
      },
    },
    request: {
      kind: 'structured',
      cond: { modelId: 'gpt-5-mini' },
      messages: singleUserPromptMessages('hello'),
      options: structuredOptions(z.object({ ok: z.boolean() })),
    },
    routePolicy: { fallbackOrder: ['openai-primary'] },
    runtimePolicy: {},
    attachmentPolicy: { materializeRemoteAttachments: true },
    responsePostprocess: { mode: 'structured' },
    hostPersistence: { persistAssistantTurn: true, outputKind: 'structured' },
    hostContext: {},
  });

  t.is(result, '{"ok":true}');
  t.true(called);
  t.snapshot(summarizePreparedDispatchRoutes(capturedRoutes));
});

test('NativeExecutionEngine should dispatch embedding prepared routes through native execution', async t => {
  const engine = createNativeExecutionEngine();
  let capturedRoutes: unknown;
  let called = false;

  const original = (serverNativeModule as any).llmEmbeddingDispatchPrepared;
  (serverNativeModule as any).llmEmbeddingDispatchPrepared = (
    routesJson: string
  ) => {
    called = true;
    capturedRoutes = JSON.parse(routesJson);
    return JSON.stringify({
      provider_id: 'openai-fallback',
      response: {
        model: 'text-embedding-3-small',
        embeddings: [[0.1, 0.2]],
      },
    });
  };
  t.teardown(() => {
    (serverNativeModule as any).llmEmbeddingDispatchPrepared = original;
  });

  const result = await engine.execute({
    nativeDispatch: {
      embedding: {
        routes: [
          nativeRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
            model: 'text-embedding-3-small',
            request: nativeEmbeddingRequest('hello'),
          }),
          nativeRoute({
            providerId: 'openai-fallback',
            authToken: 'fallback-key',
            protocol: 'gemini',
            model: 'text-embedding-3-small',
            baseUrl: GEMINI_BASE_URL,
            request: nativeEmbeddingRequest('hello fallback'),
          }),
        ],
        prepared: {
          route: preparedRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
            model: 'text-embedding-3-small',
          }),
          request: nativeEmbeddingRequest('hello'),
        },
      },
    },
    request: {
      kind: 'embedding',
      cond: { modelId: 'text-embedding-3-small' },
      modelId: 'text-embedding-3-small',
      input: 'hello',
      options: undefined,
    },
    routePolicy: { fallbackOrder: ['openai-primary'] },
    runtimePolicy: {},
    attachmentPolicy: { materializeRemoteAttachments: false },
    responsePostprocess: { mode: 'embedding' },
    hostPersistence: { persistAssistantTurn: false, outputKind: 'embedding' },
    hostContext: {},
  });

  t.snapshot({
    called,
    result,
    routes: summarizePreparedDispatchRoutes(capturedRoutes),
  });
});

test('NativeExecutionEngine should dispatch rerank prepared routes through native execution', async t => {
  const engine = createNativeExecutionEngine();
  let capturedRoutes: unknown;
  let called = false;

  const original = (serverNativeModule as any).llmRerankDispatchPrepared;
  (serverNativeModule as any).llmRerankDispatchPrepared = (
    routesJson: string
  ) => {
    called = true;
    capturedRoutes = JSON.parse(routesJson);
    return JSON.stringify({
      provider_id: 'openai-fallback',
      response: {
        model: 'gpt-4o-mini',
        scores: [0.9, 0.1],
      },
    });
  };
  t.teardown(() => {
    (serverNativeModule as any).llmRerankDispatchPrepared = original;
  });

  const result = await engine.execute({
    nativeDispatch: {
      rerank: {
        routes: [
          nativeRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
            model: 'gpt-4o-mini',
            request: nativeRerankRequest('programming', [
              { text: 'React is a UI library.' },
            ]),
          }),
          nativeRoute({
            providerId: 'openai-fallback',
            authToken: 'fallback-key',
            protocol: 'gemini',
            model: 'gpt-4o-mini',
            baseUrl: GEMINI_BASE_URL,
            request: nativeRerankRequest('programming fallback', [
              { text: 'Vue is a UI framework.' },
            ]),
          }),
        ],
        prepared: {
          route: preparedRoute({
            providerId: 'openai-primary',
            authToken: 'primary-key',
            model: 'gpt-4o-mini',
          }),
          request: nativeRerankRequest('programming', [
            { text: 'React is a UI library.' },
          ]),
        },
      },
    },
    request: {
      kind: 'rerank',
      cond: { modelId: 'gpt-4o-mini' },
      modelId: 'gpt-4o-mini',
      request: {
        query: 'programming',
        candidates: [{ text: 'React is a UI library.' }],
      },
      options: undefined,
    },
    routePolicy: { fallbackOrder: ['openai-primary'] },
    runtimePolicy: {},
    attachmentPolicy: { materializeRemoteAttachments: false },
    responsePostprocess: { mode: 'rerank' },
    hostPersistence: { persistAssistantTurn: false, outputKind: 'rerank' },
    hostContext: {},
  });

  t.snapshot({
    called,
    result,
    routes: summarizePreparedDispatchRoutes(capturedRoutes),
  });
});

test('NativeExecutionEngine should dispatch image plans through prepared native routes', async t => {
  const engine = createNativeExecutionEngine();
  let capturedRoutes: unknown;
  const original = (serverNativeModule as any).llmImageDispatchPrepared;
  (serverNativeModule as any).llmImageDispatchPrepared = (
    routesJson: string
  ) => {
    capturedRoutes = JSON.parse(routesJson);
    return JSON.stringify({
      provider_id: 'openai-image',
      response: {
        images: [
          {
            data_base64: 'aW1hZ2U=',
            media_type: 'image/webp',
          },
          {
            url: 'https://cdn.example.com/image.png',
            media_type: 'image/png',
          },
        ],
      },
    });
  };
  t.teardown(() => {
    (serverNativeModule as any).llmImageDispatchPrepared = original;
  });

  const request = nativeImageRequest('draw a cat');
  const imageArtifacts = await collectAsync(
    engine.executeImageArtifacts({
      nativeDispatch: {
        image: {
          routes: [
            nativeRoute({
              providerId: 'openai-image',
              authToken: 'image-key',
              protocol: 'openai_images',
              model: 'gpt-image-1',
              request,
            }),
          ],
          prepared: {
            route: preparedRoute({
              providerId: 'openai-image',
              authToken: 'image-key',
              protocol: 'openai_images',
              model: 'gpt-image-1',
            }),
            request,
          },
        },
      },
      request: {
        kind: 'image',
        cond: { modelId: 'gpt-image-1' },
        messages: singleUserPromptMessages('draw a cat'),
        options: undefined,
      },
      routePolicy: { fallbackOrder: ['openai-image'] },
      runtimePolicy: {},
      attachmentPolicy: { materializeRemoteAttachments: true },
      responsePostprocess: { mode: 'image' },
      hostPersistence: { persistAssistantTurn: true, outputKind: 'image' },
      hostContext: {},
    })
  );

  t.deepEqual(imageArtifacts, [
    {
      data_base64: 'aW1hZ2U=',
      media_type: 'image/webp',
    },
    {
      url: 'https://cdn.example.com/image.png',
      media_type: 'image/png',
    },
  ]);
  t.snapshot(summarizePreparedDispatchRoutes(capturedRoutes));
});

test('NativeExecutionEngine should record zero-token BYOK image usage without provider usage', async t => {
  const byok = {
    recordUsage: Sinon.stub().resolves(),
  };
  const engine = new NativeExecutionEngine(byok as never);
  const providerId = 'byok-aaaaaaaaaaaa-fal-server-key1';

  const original = (serverNativeModule as any).llmImageDispatchPrepared;
  (serverNativeModule as any).llmImageDispatchPrepared = () => {
    return JSON.stringify({
      provider_id: providerId,
      response: {
        images: [
          {
            url: 'https://cdn.example.com/image.png',
            media_type: 'image/png',
          },
        ],
      },
    });
  };
  t.teardown(() => {
    (serverNativeModule as any).llmImageDispatchPrepared = original;
  });

  const request = nativeImageRequest('draw a cat');
  const imageArtifacts = await collectAsync(
    engine.executeImageArtifacts({
      nativeDispatch: {
        image: {
          routes: [
            nativeRoute({
              providerId,
              authToken: 'image-key',
              protocol: 'fal_image',
              model: 'fal-ai/fast-sdxl',
              request,
            }),
          ],
          prepared: {
            route: preparedRoute({
              providerId,
              authToken: 'image-key',
              protocol: 'fal_image',
              model: 'fal-ai/fast-sdxl',
            }),
            request,
          },
        },
      },
      request: {
        kind: 'image',
        cond: { modelId: 'fal-ai/fast-sdxl' },
        messages: singleUserPromptMessages('draw a cat'),
        options: {
          workspace: 'workspace-1',
          user: 'user-1',
          session: 'session-1',
          featureKind: 'image',
        },
      },
      routePolicy: { fallbackOrder: [providerId] },
      runtimePolicy: {},
      attachmentPolicy: { materializeRemoteAttachments: true },
      responsePostprocess: { mode: 'image' },
      hostPersistence: { persistAssistantTurn: true, outputKind: 'image' },
      hostContext: {},
    })
  );

  t.is(imageArtifacts.length, 1);
  Sinon.assert.calledOnceWithMatch(byok.recordUsage, {
    workspaceId: 'workspace-1',
    userId: 'user-1',
    sessionId: 'session-1',
    featureKind: 'image',
    providerId,
    model: 'fal-ai/fast-sdxl',
    usage: undefined,
  });
});

test('NativeExecutionEngine should reject image plans without native dispatch', async t => {
  const engine = createNativeExecutionEngine();

  await t.throwsAsync(
    collectAsync(
      engine.executeImageArtifacts({
        request: {
          kind: 'image',
          cond: { modelId: 'gpt-image-1' },
          messages: singleUserPromptMessages('draw a cat'),
          options: undefined,
        },
        routePolicy: { fallbackOrder: [] },
        runtimePolicy: {},
        attachmentPolicy: { materializeRemoteAttachments: true },
        responsePostprocess: { mode: 'image' },
        hostPersistence: { persistAssistantTurn: true, outputKind: 'image' },
        hostContext: {},
      })
    ),
    { instanceOf: NoCopilotProviderAvailable }
  );
});
