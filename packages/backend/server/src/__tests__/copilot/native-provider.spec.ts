import serverNativeModule from '@affine/server-native';
import test from 'ava';
import { z } from 'zod';

import { CopilotPromptInvalid, CopilotProviderSideError } from '../../base';
import {
  type LlmBackendConfig,
  type LlmEmbeddingRequest,
  type LlmRequest,
  type LlmRerankRequest,
  type LlmStructuredRequest,
  type LlmStructuredResponse,
  type LlmToolLoopStreamEvent,
  parseNativeStructuredOutput,
} from '../../native';
import {
  type NodeTextMiddleware,
  ProviderMiddlewareConfig,
} from '../../plugins/copilot/config';
import { GeminiProvider } from '../../plugins/copilot/providers/gemini/gemini';
import { GeminiVertexProvider } from '../../plugins/copilot/providers/gemini/vertex';
import { OpenAIProvider } from '../../plugins/copilot/providers/openai';
import {
  CopilotProviderType,
  type PromptMessage,
  type StreamObject,
} from '../../plugins/copilot/providers/types';
import {
  buildPromptStructuredResponseFromFields,
  buildStructuredResponseContract,
  buildToolContracts,
  type RequiredStructuredOutputContract,
  requireStructuredOutputContract,
} from '../../plugins/copilot/runtime/contracts';
import {
  buildCanonicalNativeRequest,
  buildCanonicalNativeStructuredRequest,
  buildNativeRequest,
  buildNativeStructuredRequest,
} from '../../plugins/copilot/runtime/native-request-runtime';
import { getProviderRuntimeHost } from '../../plugins/copilot/runtime/provider-runtime-context';
import type { ToolLoopBackend } from '../../plugins/copilot/runtime/tool/bridge';
import { createToolExecutionCallback } from '../../plugins/copilot/runtime/tool/bridge';
import { NativeProviderAdapter } from '../../plugins/copilot/runtime/tool/native-adapter';
import { NativeRuntimeAdapter } from '../../plugins/copilot/runtime/tool/native-runtime-adapter';
import type {
  CopilotToolExecuteOptions,
  CopilotToolSet,
} from '../../plugins/copilot/tools';
import { defineTool } from '../../plugins/copilot/tools/tool';
import {
  jsonOnlyPromptMessages,
  nativeMessages,
  nativeUserText,
  promptMessages,
  systemPrompt,
  userPrompt,
} from './prompt-test-helper';

const mockDispatch = () =>
  (async function* (): AsyncIterableIterator<LlmToolLoopStreamEvent> {
    yield { type: 'text_delta', text: 'Use [^1] now' };
    yield { type: 'citation', index: 1, url: 'https://affine.pro' };
    yield { type: 'done', finish_reason: 'stop' };
  })();

function stream(
  factory: () => LlmToolLoopStreamEvent[]
): AsyncIterableIterator<LlmToolLoopStreamEvent> {
  return (async function* () {
    for (const event of factory()) {
      yield event;
    }
  })();
}

async function collectChunks<T>(iterable: AsyncIterable<T>) {
  const chunks: T[] = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  return chunks;
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

function normalizeToolExecuteOptions(
  signalOrOptions?: AbortSignal | CopilotToolExecuteOptions,
  maybeMessages?: PromptMessage[]
): CopilotToolExecuteOptions {
  if (
    signalOrOptions &&
    typeof signalOrOptions === 'object' &&
    'aborted' in signalOrOptions
  ) {
    return {
      signal: signalOrOptions,
      messages: maybeMessages,
    };
  }

  if (!signalOrOptions) {
    return maybeMessages ? { messages: maybeMessages } : {};
  }

  return {
    ...signalOrOptions,
    signal: signalOrOptions.signal,
    messages: signalOrOptions.messages ?? maybeMessages,
  };
}

function createTestToolLoopBridge(
  dispatch: (
    request: LlmRequest,
    signal?: AbortSignal
  ) => AsyncIterableIterator<LlmToolLoopStreamEvent>,
  tools: CopilotToolSet,
  maxSteps = 20
) {
  return async function* (
    request: LlmRequest,
    signalOrOptions?: AbortSignal | CopilotToolExecuteOptions,
    maybeMessages?: PromptMessage[]
  ): AsyncIterableIterator<LlmToolLoopStreamEvent> {
    const toolExecuteOptions = normalizeToolExecuteOptions(
      signalOrOptions,
      maybeMessages
    );
    const execute = createToolExecutionCallback(tools, toolExecuteOptions);
    const messages = request.messages.map(message => ({
      ...message,
      content: [...message.content],
    }));

    for (let step = 0; step < maxSteps; step++) {
      const toolCalls: Array<
        Extract<LlmToolLoopStreamEvent, { type: 'tool_call' }>
      > = [];
      let finalDone: Extract<LlmToolLoopStreamEvent, { type: 'done' }> | null =
        null;

      for await (const event of dispatch(
        { ...request, stream: true, messages },
        toolExecuteOptions.signal
      )) {
        if (event.type === 'tool_call') {
          toolCalls.push(event);
          yield event;
          continue;
        }
        if (event.type === 'done') {
          finalDone = event;
          continue;
        }
        if (event.type === 'error') {
          throw new Error(event.message);
        }
        yield event;
      }

      if (!toolCalls.length) {
        if (finalDone) {
          yield finalDone;
        }
        return;
      }

      if (step === maxSteps - 1) {
        throw new Error('ToolCallLoop max steps reached');
      }

      messages.push({
        role: 'assistant',
        content: toolCalls.map(call => ({
          type: 'tool_call',
          call_id: call.call_id,
          name: call.name,
          arguments: call.arguments,
          arguments_text: call.arguments_text,
          arguments_error: call.arguments_error,
          thought: call.thought,
        })),
      });

      for (const call of toolCalls) {
        const result = await execute({
          callId: call.call_id,
          name: call.name,
          args: call.arguments as Record<string, any>,
          rawArgumentsText: call.arguments_text,
          argumentParseError: call.arguments_error,
        });
        messages.push({
          role: 'tool',
          content: [
            {
              type: 'tool_result',
              call_id: result.callId,
              name: result.name,
              arguments: result.args,
              arguments_text: result.rawArgumentsText,
              arguments_error: result.argumentParseError,
              output: result.output,
              is_error: result.isError,
            },
          ],
        });
        yield {
          type: 'tool_result',
          call_id: result.callId,
          name: result.name,
          arguments: result.args,
          arguments_text: result.rawArgumentsText,
          arguments_error: result.argumentParseError,
          output: result.output,
          is_error: result.isError,
        };
      }
    }
  };
}

function installNativeDispatchRecorder(
  owner: Partial<{
    structuredRequests: LlmStructuredRequest[];
    structuredFactory: (request: LlmStructuredRequest) => LlmStructuredResponse;
    embeddingRequests: LlmEmbeddingRequest[];
    embeddingFactory: (request: LlmEmbeddingRequest) => {
      model: string;
      embeddings: number[][];
      usage?: {
        prompt_tokens: number;
        total_tokens: number;
      };
    };
    rerankRequests: LlmRerankRequest[];
    rerankFactory: (request: LlmRerankRequest) => {
      model: string;
      scores: number[];
    };
  }>
) {
  const originalStructured = (serverNativeModule as any).llmStructuredDispatch;
  const originalEmbedding = (serverNativeModule as any).llmEmbeddingDispatch;
  const originalRerank = (serverNativeModule as any).llmRerankDispatch;

  if (owner.structuredRequests && owner.structuredFactory) {
    (serverNativeModule as any).llmStructuredDispatch = (
      _protocol: string,
      _backendConfigJson: string,
      requestJson: string
    ) => {
      const request = JSON.parse(requestJson) as LlmStructuredRequest;
      owner.structuredRequests!.push(request);
      return JSON.stringify(owner.structuredFactory!(request));
    };
  }

  if (owner.embeddingRequests && owner.embeddingFactory) {
    (serverNativeModule as any).llmEmbeddingDispatch = (
      _protocol: string,
      _backendConfigJson: string,
      requestJson: string
    ) => {
      const request = JSON.parse(requestJson) as LlmEmbeddingRequest;
      owner.embeddingRequests!.push(request);
      return JSON.stringify(owner.embeddingFactory!(request));
    };
  }

  if (owner.rerankRequests && owner.rerankFactory) {
    (serverNativeModule as any).llmRerankDispatch = (
      _protocol: string,
      _backendConfigJson: string,
      requestJson: string
    ) => {
      const request = JSON.parse(requestJson) as LlmRerankRequest;
      owner.rerankRequests!.push(request);
      return JSON.stringify(owner.rerankFactory!(request));
    };
  }

  return () => {
    (serverNativeModule as any).llmStructuredDispatch = originalStructured;
    (serverNativeModule as any).llmEmbeddingDispatch = originalEmbedding;
    (serverNativeModule as any).llmRerankDispatch = originalRerank;
  };
}

function installRemoteAttachmentMaterializer(owner: {
  remoteAttachmentRequests: string[];
  remoteAttachmentSignals: Array<AbortSignal | undefined>;
  remoteAttachmentResponses: Map<string, { data: string; mimeType: string }>;
}) {
  return {
    fetchRemoteAttachment: async (
      url: string,
      options: { signal?: AbortSignal }
    ) => {
      owner.remoteAttachmentRequests.push(url);
      owner.remoteAttachmentSignals.push(options.signal);
      const response = owner.remoteAttachmentResponses.get(url);
      if (!response) {
        throw new Error(`missing remote attachment stub for ${url}`);
      }
      return response;
    },
  };
}

class TestGeminiProvider extends GeminiProvider<{ apiKey: string }> {
  override readonly type = CopilotProviderType.Gemini;
  readonly dispatchRequests: LlmRequest[] = [];
  readonly structuredRequests: LlmStructuredRequest[] = [];
  readonly embeddingRequests: LlmEmbeddingRequest[] = [];
  readonly remoteAttachmentRequests: string[] = [];
  readonly remoteAttachmentSignals: Array<AbortSignal | undefined> = [];
  readonly retryDelays: number[] = [];
  remoteAttachmentResponses = new Map<
    string,
    { data: string; mimeType: string }
  >();
  testTools: CopilotToolSet = {};
  testMiddleware: ProviderMiddlewareConfig = {
    rust: {
      request: ['normalize_messages', 'tool_schema_rewrite'],
      stream: ['stream_event_normalize', 'citation_indexing'],
    },
    node: {
      text: ['citation_footnote', 'callout'],
    },
  };
  dispatchFactory: (request: LlmRequest) => LlmToolLoopStreamEvent[] = () => [
    { type: 'text_delta', text: 'native' },
    { type: 'done', finish_reason: 'stop' },
  ];
  structuredFactory: (request: LlmStructuredRequest) => LlmStructuredResponse =
    () => ({
      id: 'structured_1',
      model: 'gemini-2.5-flash',
      output_text: '{"summary":"AFFiNE native"}',
      output_json: { summary: 'AFFiNE native' },
      usage: {
        prompt_tokens: 4,
        completion_tokens: 3,
        total_tokens: 7,
      },
      finish_reason: 'stop',
    });
  embeddingFactory: (request: LlmEmbeddingRequest) => {
    model: string;
    embeddings: number[][];
    usage?: {
      prompt_tokens: number;
      total_tokens: number;
    };
  } = request => ({
    model: request.model,
    embeddings: request.inputs.map((_, index) => [index + 0.1, index + 0.2]),
    usage: {
      prompt_tokens: request.inputs.length,
      total_tokens: request.inputs.length,
    },
  });
  protected override readonly attachmentMaterializer =
    installRemoteAttachmentMaterializer(this) as any;

  override configured() {
    return true;
  }

  protected override async createNativeConfig(): Promise<LlmBackendConfig> {
    return {
      base_url: 'https://generativelanguage.googleapis.com/v1beta',
      auth_token: 'api-key',
      request_layer: 'gemini_api',
    };
  }

  private createTestDispatch(_backendConfig: LlmBackendConfig) {
    return (request: LlmRequest) => {
      this.dispatchRequests.push(request);
      return stream(() => this.dispatchFactory(request));
    };
  }

  override createNativeAdapter(
    backend: ToolLoopBackend,
    tools: CopilotToolSet,
    nodeTextMiddleware?: NodeTextMiddleware[]
  ) {
    if (!('backendConfig' in backend)) {
      throw new Error('expected direct backend config for test adapter');
    }
    return new NativeProviderAdapter(
      createTestToolLoopBridge(
        this.createTestDispatch(backend.backendConfig),
        tools,
        this.MAX_STEPS
      ),
      { nodeTextMiddleware }
    );
  }

  protected override async waitForStructuredRetry(delayMs: number) {
    this.retryDelays.push(delayMs);
  }

  override getActiveProviderMiddleware(): ProviderMiddlewareConfig {
    return this.testMiddleware;
  }

  override async getTools(): Promise<CopilotToolSet> {
    return this.testTools;
  }
}

class TestGeminiVertexProvider extends GeminiVertexProvider {
  testConfig = {
    location: 'us-central1',
    project: 'p1',
    googleAuthOptions: {},
  } as any;
  readonly dispatchRequests: LlmRequest[] = [];
  readonly remoteAttachmentRequests: string[] = [];
  readonly remoteAttachmentSignals: Array<AbortSignal | undefined> = [];
  remoteAttachmentResponses = new Map<
    string,
    { data: string; mimeType: string }
  >();
  testTools: CopilotToolSet = {};
  testMiddleware: ProviderMiddlewareConfig = {
    rust: {
      request: ['normalize_messages', 'tool_schema_rewrite'],
      stream: ['stream_event_normalize', 'citation_indexing'],
    },
    node: {
      text: ['citation_footnote', 'callout'],
    },
  };
  protected override readonly attachmentMaterializer =
    installRemoteAttachmentMaterializer(this) as any;

  override get config() {
    return this.testConfig;
  }

  override configured() {
    return true;
  }

  protected override async resolveVertexAuth() {
    return {
      baseUrl: 'https://vertex.example',
      headers: () => ({
        Authorization: 'Bearer vertex-token',
        'x-goog-user-project': 'p1',
      }),
      fetch: undefined,
    } as const;
  }

  private createTestDispatch(_backendConfig: LlmBackendConfig) {
    return (request: LlmRequest) => {
      this.dispatchRequests.push(request);
      return stream(() => [
        { type: 'text_delta', text: 'vertex native' },
        { type: 'done', finish_reason: 'stop' },
      ]);
    };
  }

  // oxlint-disable-next-line sonarjs/no-identical-functions
  override createNativeAdapter(
    backend: ToolLoopBackend,
    tools: CopilotToolSet,
    nodeTextMiddleware?: NodeTextMiddleware[]
  ) {
    if (!('backendConfig' in backend)) {
      throw new Error('expected direct backend config for test adapter');
    }
    return new NativeProviderAdapter(
      createTestToolLoopBridge(
        this.createTestDispatch(backend.backendConfig),
        tools,
        this.MAX_STEPS
      ),
      { nodeTextMiddleware }
    );
  }

  override getActiveProviderMiddleware(): ProviderMiddlewareConfig {
    return this.testMiddleware;
  }

  override async getTools(): Promise<CopilotToolSet> {
    return this.testTools;
  }

  async exposeNativeConfig() {
    return await this.createNativeConfig();
  }
}

class TestOpenAIProvider extends OpenAIProvider {
  readonly structuredRequests: LlmStructuredRequest[] = [];
  readonly embeddingRequests: LlmEmbeddingRequest[] = [];
  readonly rerankRequests: LlmRerankRequest[] = [];
  structuredFactory: (request: LlmStructuredRequest) => LlmStructuredResponse =
    request => ({
      id: 'structured_openai_1',
      model: request.model,
      output_text: '{"summary":"AFFiNE structured"}',
      output_json: { summary: 'AFFiNE structured' },
      usage: {
        prompt_tokens: 4,
        completion_tokens: 3,
        total_tokens: 7,
      },
      finish_reason: 'stop',
    });
  embeddingFactory: (request: LlmEmbeddingRequest) => {
    model: string;
    embeddings: number[][];
    usage?: {
      prompt_tokens: number;
      total_tokens: number;
    };
  } = request => ({
    model: request.model,
    embeddings: request.inputs.map(() => [0.4, 0.5]),
    usage: {
      prompt_tokens: request.inputs.length,
      total_tokens: request.inputs.length,
    },
  });
  rerankFactory: (request: LlmRerankRequest) => {
    model: string;
    scores: number[];
  } = request => ({
    model: request.model,
    scores: request.candidates.map(() => 0.8),
  });
  testMiddleware: ProviderMiddlewareConfig = {
    rust: {
      request: ['normalize_messages', 'tool_schema_rewrite'],
      stream: ['stream_event_normalize', 'citation_indexing'],
    },
  };

  override get config() {
    return {
      apiKey: 'openai-key',
      baseURL: 'https://api.openai.com/v1',
    };
  }

  override configured() {
    return true;
  }

  override getActiveProviderMiddleware(): ProviderMiddlewareConfig {
    return this.testMiddleware;
  }
}

test('NativeProviderAdapter should append citation and attachment footnotes', async t => {
  const dispatch = () =>
    (async function* (): AsyncIterableIterator<LlmToolLoopStreamEvent> {
      yield {
        type: 'tool_result',
        call_id: 'call_1',
        name: 'blob_read',
        arguments: { blob_id: 'blob_1' },
        output: {
          blobId: 'blob_1',
          fileName: 'a.txt',
          fileType: 'text/plain',
          content: 'A',
        },
      };
      yield {
        type: 'tool_result',
        call_id: 'call_2',
        name: 'blob_read',
        arguments: { blob_id: 'blob_2' },
        output: {
          blobId: 'blob_2',
          fileName: 'b.txt',
          fileType: 'text/plain',
          content: 'B',
        },
      };
      yield { type: 'text_delta', text: 'Answer from files.' };
      yield { type: 'done', finish_reason: 'stop' };
    })();
  const dispatchWithModelReference = () =>
    (async function* (): AsyncIterableIterator<LlmToolLoopStreamEvent> {
      yield {
        type: 'tool_result',
        call_id: 'call_1',
        name: 'doc_semantic_search',
        arguments: { query: 'A' },
        output: [
          {
            blobId: 'blob_1',
            name: 'a.txt',
            mimeType: 'text/plain',
            content: 'A',
          },
        ],
      };
      yield { type: 'text_delta', text: 'Answer from file.[^1]' };
      yield { type: 'done', finish_reason: 'stop' };
    })();

  const cases = [
    {
      title: 'streamText citation footnotes',
      run: async () => {
        const adapter = new NativeProviderAdapter(
          createTestToolLoopBridge(mockDispatch, {}, 3)
        );
        return (
          await collectChunks(
            adapter.streamText({
              model: 'gpt-5-mini',
              stream: true,
              messages: nativeMessages(nativeUserText('hi')),
            })
          )
        ).join('');
      },
      verify: (text: string) => {
        t.true(text.includes('Use [^1] now'));
        t.true(
          text.includes('[^1]: {"type":"url","url":"https%3A%2F%2Faffine.pro"}')
        );
      },
    },
    {
      title: 'streamObject citation footnotes',
      run: async () => {
        const adapter = new NativeProviderAdapter(
          createTestToolLoopBridge(mockDispatch, {}, 3)
        );
        const chunks = await collectChunks(
          adapter.streamObject({
            model: 'gpt-5-mini',
            stream: true,
            messages: nativeMessages(nativeUserText('hi')),
          })
        );
        t.deepEqual(
          chunks.map(chunk => chunk.type),
          ['text-delta', 'text-delta'],
          'streamObject citation chunk types'
        );
        return chunks
          .filter(chunk => chunk.type === 'text-delta')
          .map(chunk => chunk.textDelta)
          .join('');
      },
      verify: (text: string) => {
        t.true(text.includes('Use [^1] now'));
        t.true(
          text.includes('[^1]: {"type":"url","url":"https%3A%2F%2Faffine.pro"}')
        );
      },
    },
    {
      title: 'streamObject attachment footnotes',
      run: async () => {
        const adapter = new NativeProviderAdapter(
          createTestToolLoopBridge(dispatch, {}, 3)
        );
        const chunks = await collectChunks(
          adapter.streamObject({
            model: 'gpt-5-mini',
            stream: true,
            messages: nativeMessages(nativeUserText('hi')),
          })
        );
        return chunks
          .filter(chunk => chunk.type === 'text-delta')
          .map(chunk => chunk.textDelta)
          .join('');
      },
      verify: (text: string) => {
        t.true(text.includes('Answer from files.'));
        t.true(text.includes('[^1][^2]'));
        t.true(
          text.includes(
            '[^1]: {"type":"attachment","blobId":"blob_1","fileName":"a.txt","fileType":"text/plain"}'
          )
        );
        t.true(
          text.includes(
            '[^2]: {"type":"attachment","blobId":"blob_2","fileName":"b.txt","fileType":"text/plain"}'
          )
        );
      },
    },
    {
      title: 'streamObject attachment definitions for model references',
      run: async () => {
        const adapter = new NativeProviderAdapter(
          createTestToolLoopBridge(dispatchWithModelReference, {}, 3)
        );
        const chunks = await collectChunks(
          adapter.streamObject({
            model: 'gpt-5-mini',
            stream: true,
            messages: nativeMessages(nativeUserText('hi')),
          })
        );
        return chunks
          .filter(chunk => chunk.type === 'text-delta')
          .map(chunk => chunk.textDelta)
          .join('');
      },
      verify: (text: string) => {
        t.true(text.includes('Answer from file.[^1]'));
        t.true(
          text.includes(
            '[^1]: {"type":"attachment","blobId":"blob_1","fileName":"a.txt","fileType":"text/plain"}'
          )
        );
      },
    },
  ] as const;

  for (const testCase of cases) {
    testCase.verify(await testCase.run());
  }
});

test('NativeProviderAdapter streamObject should map tool and text events', async t => {
  let round = 0;
  const dispatch = (_request: LlmRequest) =>
    (async function* (): AsyncIterableIterator<LlmToolLoopStreamEvent> {
      round += 1;
      if (round === 1) {
        yield {
          type: 'tool_call',
          call_id: 'call_1',
          name: 'doc_read',
          arguments: { doc_id: 'a1' },
        };
        yield { type: 'done', finish_reason: 'tool_calls' };
        return;
      }
      yield { type: 'text_delta', text: 'ok' };
      yield { type: 'done', finish_reason: 'stop' };
    })();

  const adapter = new NativeProviderAdapter(
    createTestToolLoopBridge(
      dispatch,
      {
        doc_read: {
          inputSchema: z.object({ doc_id: z.string() }),
          execute: async () => ({ markdown: '# a1' }),
        },
      },
      4
    )
  );

  const events = [];
  for await (const event of adapter.streamObject({
    model: 'gpt-5-mini',
    stream: true,
    messages: nativeMessages(nativeUserText('read')),
  })) {
    events.push(event);
  }

  t.deepEqual(
    events.map(event => event.type),
    ['tool-call', 'tool-result', 'text-delta']
  );
  t.snapshot(events);
});

test('NativeProviderAdapter streamObject should finalize usage with selected provider', async t => {
  const usageEvents: Array<{
    providerId: string;
    model?: string;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      cached_tokens?: number;
    };
  }> = [];
  const adapter = new NativeProviderAdapter(
    () =>
      stream(() => [
        { type: 'message_start', model: 'gpt-5-mini' },
        { type: 'text_delta', text: 'ok' },
        {
          type: 'done',
          finish_reason: 'stop',
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        },
        {
          type: 'provider_selected',
          provider_id: 'byok-aaaaaaaaaaaa-openai-server-key1',
        },
      ]),
    {
      onUsage: input => {
        usageEvents.push(input);
      },
    }
  );

  const events = await collectChunks(
    adapter.streamObject({
      model: 'gpt-5-mini',
      stream: true,
      messages: nativeMessages(nativeUserText('hi')),
    })
  );

  t.deepEqual(events, [{ type: 'text-delta', textDelta: 'ok' }]);
  t.deepEqual(usageEvents, [
    {
      providerId: 'byok-aaaaaaaaaaaa-openai-server-key1',
      model: 'gpt-5-mini',
      usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
    },
  ]);
});

test('NativeProviderAdapter streamObject should keep streaming when usage callback fails', async t => {
  const adapter = new NativeProviderAdapter(
    () =>
      stream(() => [
        { type: 'message_start', model: 'gpt-5-mini' },
        { type: 'text_delta', text: 'ok' },
        {
          type: 'done',
          finish_reason: 'stop',
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        },
        {
          type: 'provider_selected',
          provider_id: 'byok-aaaaaaaaaaaa-openai-server-key1',
        },
      ]),
    {
      onUsage: () => {
        throw new Error('usage callback failed');
      },
    }
  );

  const events = await collectChunks(
    adapter.streamObject({
      model: 'gpt-5-mini',
      stream: true,
      messages: nativeMessages(nativeUserText('hi')),
    })
  );

  t.deepEqual(events, [{ type: 'text-delta', textDelta: 'ok' }]);
});

test('NativeRuntimeAdapter streamObject should keep raw runtime stream objects only', async t => {
  const adapter = new NativeRuntimeAdapter(
    createTestToolLoopBridge(mockDispatch, {}, 3)
  );

  const chunks: StreamObject[] = [];
  for await (const chunk of adapter.streamObject({
    model: 'gpt-5-mini',
    stream: true,
    messages: nativeMessages(nativeUserText('hi')),
  })) {
    chunks.push(chunk);
  }

  t.deepEqual(chunks, [{ type: 'text-delta', textDelta: 'Use [^1] now' }]);
});

test('structured response contract helpers should normalize explicit fields only', t => {
  const schemaJson = {
    type: 'object',
    properties: {
      summary: { type: 'string' },
    },
    required: ['summary'],
    additionalProperties: false,
  };
  const reorderedSchemaJson = {
    required: ['summary'],
    additionalProperties: false,
    properties: {
      summary: { type: 'string' },
    },
    type: 'object',
  };

  const explicit = buildPromptStructuredResponseFromFields({
    responseSchemaJson: schemaJson,
  });
  const reordered = buildPromptStructuredResponseFromFields({
    responseSchemaJson: reorderedSchemaJson,
  });

  t.truthy(explicit);
  t.is(explicit?.schemaHash, reordered?.schemaHash);
  t.deepEqual(explicit, {
    responseSchemaJson: schemaJson,
    schemaHash: reordered?.schemaHash,
  });
});

test('buildNativeRequest should include rust middleware from profile', async t => {
  const { request } = await buildNativeRequest({
    model: 'gpt-5-mini',
    messages: promptMessages(userPrompt('hello')),
    toolContracts: [],
    middleware: {
      rust: {
        request: ['normalize_messages', 'clamp_max_tokens'],
        stream: ['stream_event_normalize', 'citation_indexing'],
      },
      node: {
        text: ['callout'],
      },
    },
  });

  t.deepEqual(request.middleware, {
    request: ['normalize_messages', 'clamp_max_tokens'],
    stream: ['stream_event_normalize', 'citation_indexing'],
  });
});

test('buildCanonicalNativeRequest should only use explicit structured contract inputs', async t => {
  const schema = z.object({
    summary: z.string(),
  });

  const { request } = await buildCanonicalNativeRequest({
    model: 'gpt-4.1',
    messages: promptMessages(
      systemPrompt('Return valid JSON.'),
      userPrompt('Summarize AFFiNE.')
    ),
    responseContract: buildStructuredResponseContract(schema),
  });

  t.snapshot(request.responseSchema);
});

test('buildCanonicalNativeStructuredRequest should accept schema-only explicit structured response contracts', async t => {
  const { request } = await buildCanonicalNativeStructuredRequest({
    model: 'gpt-4.1',
    messages: [
      {
        role: 'system',
        content: 'Return JSON only.',
        responseFormat: {
          type: 'json_schema',
          responseSchemaJson: {
            type: 'object',
            properties: { summary: { type: 'string' } },
            required: ['summary'],
            additionalProperties: false,
          },
          strict: false,
        },
      },
      { role: 'user', content: 'Summarize AFFiNE.' },
    ],
    responseContract: {
      responseSchemaJson: {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary'],
        additionalProperties: false,
      },
    },
  });

  t.snapshot({
    schema: request.schema,
    strict: request.strict,
  });
});

test('buildCanonicalNativeStructuredRequest should honor explicit structured options contract before system responseFormat', async t => {
  const responseContract = buildPromptStructuredResponseFromFields({
    responseSchemaJson: {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
      required: ['ok'],
      additionalProperties: false,
    },
    schemaHash: 'ok-v1',
    strict: true,
  });
  const { request } = await buildCanonicalNativeStructuredRequest({
    model: 'gpt-4.1',
    messages: [
      {
        role: 'system',
        content: 'Return JSON only.',
        responseFormat: {
          type: 'json_schema',
          responseSchemaJson: {
            type: 'object',
            properties: { summary: { type: 'string' } },
            required: ['summary'],
            additionalProperties: false,
          },
          strict: false,
        },
      },
      { role: 'user', content: 'Summarize AFFiNE.' },
    ],
    options: {
      responseSchemaJson: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false,
      },
      schemaHash: 'ok-v1',
      strict: true,
    },
    responseContract: responseContract!,
  });

  t.snapshot({
    schema: request.schema,
    strict: request.strict,
  });
});

test('buildCanonicalNativeStructuredRequest should honor explicit responseSchema for array outputs', async t => {
  const schema = z.array(z.object({ speaker: z.string(), text: z.string() }));
  const { request } = await buildCanonicalNativeStructuredRequest({
    model: 'gemini-2.5-flash',
    messages: jsonOnlyPromptMessages('Transcribe this audio.'),
    options: {},
    responseContract: buildStructuredResponseContract(schema),
  });

  t.snapshot(request.schema);
});

test('buildCanonicalNativeStructuredRequest should consume explicit structured response contract without options.schema', async t => {
  const schema = z.object({ summary: z.string() });
  const responseContract = buildStructuredResponseContract(schema);
  const { request } = await buildCanonicalNativeStructuredRequest({
    model: 'gemini-2.5-flash',
    messages: jsonOnlyPromptMessages('Summarize AFFiNE.'),
    options: { strict: false },
    responseContract,
  });

  t.snapshot({ schema: request.schema, strict: request.strict });
});

test('buildCanonicalNativeStructuredRequest should accept explicit schema contracts without schemaHash', async t => {
  const { request } = await buildCanonicalNativeStructuredRequest({
    model: 'gpt-4.1',
    messages: jsonOnlyPromptMessages('Summarize AFFiNE.'),
    responseContract: {
      responseSchemaJson: {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary'],
        additionalProperties: false,
      },
    },
  });

  t.snapshot({
    schema: request.schema,
    strict: request.strict,
  });
});

test('buildNativeRequest should canonicalize Gemini attachments', async t => {
  const cases: Array<{
    title: string;
    input: Parameters<typeof buildNativeRequest>[0];
  }> = [
    {
      title: 'remote file url',
      input: {
        model: 'gemini-2.5-flash',
        messages: [
          {
            role: 'user' as const,
            content: 'summarize this attachment',
            attachments: ['https://example.com/a.pdf'],
            params: { mimetype: 'application/pdf' },
          },
        ],
      },
    },
    {
      title: 'remote image url',
      input: {
        model: 'gemini-2.5-flash',
        messages: [
          {
            role: 'user' as const,
            content: 'describe this image',
            attachments: ['https://example.com/cat.png'],
          },
        ],
      },
    },
    {
      title: 'data url',
      input: {
        model: 'gemini-2.5-flash',
        messages: [
          {
            role: 'user' as const,
            content: 'read this note',
            attachments: ['data:text/plain,hello%20world'],
            params: { mimetype: 'text/plain' },
          },
        ],
      },
    },
    {
      title: 'remote audio url',
      input: {
        model: 'gemini-2.5-flash',
        messages: [
          {
            role: 'user' as const,
            content: 'transcribe this clip',
            attachments: ['https://example.com/a.mp3'],
            params: { mimetype: 'audio/mpeg' },
          },
        ],
      },
    },
    {
      title: 'bytes and file handle',
      input: {
        model: 'gemini-2.5-flash',
        messages: [
          {
            role: 'user' as const,
            content: 'inspect these assets',
            attachments: [
              {
                kind: 'bytes' as const,
                data: Buffer.from('hello', 'utf8').toString('base64'),
                mimeType: 'text/plain',
                fileName: 'hello.txt',
              },
              {
                kind: 'file_handle' as const,
                fileHandle: 'file_123',
                mimeType: 'application/pdf',
                fileName: 'report.pdf',
              },
            ],
          },
        ],
        attachmentCapability: {
          kinds: ['image', 'audio', 'file'],
          sourceKinds: ['bytes', 'file_handle'],
        },
      },
    },
  ];

  for (const testCase of cases) {
    const { request } = await buildNativeRequest(testCase.input);
    t.snapshot(request.messages[0]?.content, testCase.title);
  }
});

test('buildNativeRequest should reject attachments outside native admission matrix', async t => {
  const error = await t.throwsAsync(
    buildNativeRequest({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: 'summarize this attachment',
          attachments: ['https://example.com/a.pdf'],
          params: { mimetype: 'application/pdf' },
        },
      ],
      attachmentCapability: {
        kinds: ['image'],
        sourceKinds: ['url', 'data'],
        allowRemoteUrls: true,
      },
    })
  );

  t.true(error instanceof CopilotPromptInvalid);
  t.regex(error.message, /does not support file attachments/i);
});

test('buildNativeStructuredRequest should prefer explicit schema option', async t => {
  const provider = new TestOpenAIProvider();
  t.teardown(installNativeDispatchRecorder(provider));
  const schema = z.object({ summary: z.string() });

  await getProviderRuntimeHost(provider).run.structured(
    { modelId: 'gpt-4.1' },
    jsonOnlyPromptMessages('Summarize AFFiNE in one sentence.'),
    structuredOptions(schema),
    structuredContract(schema)
  );

  t.snapshot(provider.structuredRequests[0]?.schema);
});

test('buildNativeStructuredRequest should preserve caller strictness override', async t => {
  const provider = new TestOpenAIProvider();
  t.teardown(installNativeDispatchRecorder(provider));

  await getProviderRuntimeHost(provider).run.structured(
    { modelId: 'gpt-4.1' },
    jsonOnlyPromptMessages('Summarize AFFiNE in one sentence.'),
    structuredOptions(z.object({ summary: z.string() }), { strict: false }),
    structuredContract(z.object({ summary: z.string() }))
  );

  t.is(provider.structuredRequests[0]?.strict, false);
});

test('buildNativeStructuredRequest should ignore legacy params.schema fallback when explicit schema contract exists', async t => {
  const { request } = await buildNativeStructuredRequest({
    model: 'gpt-4.1',
    messages: promptMessages(
      systemPrompt('Return JSON only.', {
        params: {
          schema: z.object({ summary: z.string() }),
        },
      }),
      userPrompt('Summarize AFFiNE in one sentence.')
    ),
    responseContract: {
      responseSchemaJson: {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary'],
        additionalProperties: false,
      },
    },
  });

  t.snapshot({
    schema: request.schema,
    strict: request.strict,
  });
});

test('buildNativeStructuredRequest should reject legacy options.schema fallback', async t => {
  const provider = new TestOpenAIProvider();

  const error = await t.throwsAsync(() =>
    getProviderRuntimeHost(provider).run.structured(
      { modelId: 'gpt-4.1' },
      jsonOnlyPromptMessages('Summarize AFFiNE in one sentence.'),
      {
        schema: z.object({ summary: z.string() }),
      } as never
    )
  );

  t.true(error instanceof CopilotPromptInvalid);
  t.regex((error as Error).message, /Schema is required/);
});

test('buildNativeRequest should preserve tool schemas and defer Gemini rewrite to native request layer', async t => {
  const schema = z.object({
    doc_id: z.string(),
    options: z.object({ mode: z.enum(['full', 'summary']) }),
  });

  const [{ request: geminiRequest }, { request: openaiRequest }] =
    await Promise.all([
      buildNativeRequest({
        model: 'gemini-2.5-flash',
        messages: promptMessages(userPrompt('read doc')),
        toolContracts: buildToolContracts({
          doc_read: defineTool({
            inputSchema: schema,
            execute: async () => ({ markdown: '# doc' }),
          }),
        }),
      }),
      buildNativeRequest({
        model: 'gpt-4.1',
        messages: promptMessages(userPrompt('read doc')),
        toolContracts: buildToolContracts({
          doc_read: defineTool({
            inputSchema: schema,
            execute: async () => ({ markdown: '# doc' }),
          }),
        }),
      }),
    ]);

  t.true(
    JSON.stringify(geminiRequest.tools?.[0]?.parameters).includes(
      'additionalProperties'
    )
  );
  t.true(
    JSON.stringify(openaiRequest.tools?.[0]?.parameters).includes(
      'additionalProperties'
    )
  );
});

test('defineTool should precompute json schema at definition time', t => {
  const tool = defineTool({
    description: 'Read a doc',
    inputSchema: z.object({
      docId: z.string(),
      includeChildren: z.boolean().optional(),
    }),
    execute: async () => ({ ok: true }),
  });

  t.snapshot(tool.jsonSchema);
});

test('buildNativeStructuredRequest should preserve schemas and defer Gemini rewrite to native request layer', async t => {
  const schema = z.object({
    summary: z.string(),
    metadata: z.object({ format: z.enum(['short', 'long']) }),
  });

  const [{ request: geminiRequest }, { request: openaiRequest }] =
    await Promise.all([
      buildNativeStructuredRequest({
        model: 'gemini-2.5-flash',
        messages: promptMessages(userPrompt('Summarize AFFiNE.')),
        responseContract: buildStructuredResponseContract(schema),
      }),
      buildNativeStructuredRequest({
        model: 'gpt-4.1',
        messages: promptMessages(userPrompt('Summarize AFFiNE.')),
        responseContract: buildStructuredResponseContract(schema),
      }),
    ]);

  for (const [title, request] of [
    ['gemini', geminiRequest],
    ['openai', openaiRequest],
  ] as const) {
    t.true(
      JSON.stringify(request.schema).includes('additionalProperties'),
      title
    );
  }
});

test('NativeProviderAdapter streamText should skip citation footnotes when disabled', async t => {
  const adapter = new NativeProviderAdapter(
    createTestToolLoopBridge(mockDispatch, {}, 3),
    { nodeTextMiddleware: ['callout'] }
  );
  const chunks: string[] = [];
  for await (const chunk of adapter.streamText({
    model: 'gpt-5-mini',
    stream: true,
    messages: nativeMessages(nativeUserText('hi')),
  })) {
    chunks.push(chunk);
  }

  const text = chunks.join('');
  t.true(text.includes('Use [^1] now'));
  t.false(
    text.includes('[^1]: {"type":"url","url":"https%3A%2F%2Faffine.pro"}')
  );
});

test('GeminiProvider should use native path for text-only requests', async t => {
  const provider = new TestGeminiProvider();

  const result = await getProviderRuntimeHost(provider).run.text(
    { modelId: 'gemini-2.5-flash' },
    promptMessages(userPrompt('hello')),
    { reasoning: true }
  );

  t.is(result, 'native');
  t.is(provider.dispatchRequests.length, 1);
  t.snapshot({
    remoteAttachmentRequests: provider.remoteAttachmentRequests,
    include: provider.dispatchRequests[0]?.include,
    reasoning: provider.dispatchRequests[0]?.reasoning,
    middleware: provider.dispatchRequests[0]?.middleware,
  });
});

test('GeminiProvider should use native path for structured requests', async t => {
  const provider = new TestGeminiProvider();
  t.teardown(installNativeDispatchRecorder(provider));

  const schema = z.object({ summary: z.string() });
  const result = await getProviderRuntimeHost(provider).run.structured(
    { modelId: 'gemini-2.5-flash' },
    jsonOnlyPromptMessages('Summarize AFFiNE in one short sentence.'),
    structuredOptions(schema),
    structuredContract(schema)
  );

  t.is(provider.structuredRequests.length, 1);
  t.snapshot({
    request: provider.structuredRequests[0],
    result: JSON.parse(result),
  });
});

test('GeminiProvider should retry when native structured dispatch returns invalid_structured_output', async t => {
  const provider = new TestGeminiProvider();
  t.teardown(installNativeDispatchRecorder(provider));
  let attempts = 0;
  provider.structuredFactory = () => {
    attempts += 1;
    if (attempts === 1) {
      throw Object.assign(
        new Error(
          'structured response did not contain valid JSON: summary: missing'
        ),
        { code: 'invalid_structured_output' as const }
      );
    }
    return {
      id: `structured_retry_${attempts}`,
      model: 'gemini-2.5-flash',
      output_text: '{"summary":"ok"}',
      output_json: { summary: 'ok' },
      usage: {
        prompt_tokens: 4,
        completion_tokens: 3,
        total_tokens: 7,
      },
      finish_reason: 'stop',
    };
  };

  const result = await getProviderRuntimeHost(provider).run.structured(
    { modelId: 'gemini-2.5-flash' },
    jsonOnlyPromptMessages('Summarize AFFiNE in one short sentence.'),
    structuredOptions(z.object({ summary: z.string() }), { maxRetries: 2 }),
    structuredContract(z.object({ summary: z.string() }))
  );

  t.is(attempts, 2);
  t.deepEqual(JSON.parse(result), { summary: 'ok' });
});

test('GeminiProvider should treat maxRetries as retry count for backend failures', async t => {
  const provider = new TestGeminiProvider();
  t.teardown(installNativeDispatchRecorder(provider));
  let attempts = 0;
  provider.structuredFactory = () => {
    attempts += 1;
    throw new Error('backend down');
  };

  const error = await t.throwsAsync(
    getProviderRuntimeHost(provider).run.structured(
      { modelId: 'gemini-2.5-flash' },
      jsonOnlyPromptMessages('Summarize AFFiNE in one short sentence.'),
      structuredOptions(z.object({ summary: z.string() }), { maxRetries: 2 }),
      structuredContract(z.object({ summary: z.string() }))
    )
  );

  t.is(attempts, 3);
  t.deepEqual(provider.retryDelays, [2_000, 4_000]);
  t.regex(error.message, /backend down/);
});

test('GeminiProvider should use native structured path for audio attachments', async t => {
  const provider = new TestGeminiProvider();
  t.teardown(installNativeDispatchRecorder(provider));
  const inlineData = Buffer.from('audio-bytes', 'utf8').toString('base64');
  provider.remoteAttachmentResponses.set('https://example.com/a.mp3', {
    data: inlineData,
    mimeType: 'audio/mpeg',
  });
  provider.structuredFactory = () => ({
    id: 'structured_audio_1',
    model: 'gemini-2.5-flash',
    output_text: '[{"a":"Speaker 1","s":0,"e":1,"t":"Hello"}]',
    output_json: [{ a: 'Speaker 1', s: 0, e: 1, t: 'Hello' }],
    usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
    finish_reason: 'stop',
  });

  const result = await getProviderRuntimeHost(provider).run.structured(
    { modelId: 'gemini-2.5-flash' },
    promptMessages(
      systemPrompt('Return JSON only.'),
      userPrompt('transcribe the audio', {
        attachments: ['https://example.com/a.mp3'],
        params: { mimetype: 'audio/mpeg' },
      })
    ),
    structuredOptions(
      z.array(
        z.object({ a: z.string(), s: z.number(), e: z.number(), t: z.string() })
      )
    ),
    structuredContract(
      z.array(
        z.object({ a: z.string(), s: z.number(), e: z.number(), t: z.string() })
      )
    )
  );

  t.is(provider.structuredRequests.length, 1);
  t.snapshot({
    content: provider.structuredRequests[0]?.messages[1]?.content,
    remoteAttachmentRequests: provider.remoteAttachmentRequests,
    result: JSON.parse(result),
  });
});

test('GeminiProvider should use native path for embeddings', async t => {
  const provider = new TestGeminiProvider();
  t.teardown(installNativeDispatchRecorder(provider));

  const result = await getProviderRuntimeHost(provider).run.embedding(
    { modelId: 'gemini-embedding-001' },
    ['first', 'second'],
    { dimensions: 3 }
  );

  t.is(provider.embeddingRequests.length, 1);
  t.snapshot({ result, request: provider.embeddingRequests[0] });
});

test('GeminiProvider should canonicalize native text attachments', async t => {
  const cases = [
    {
      title: 'remote file attachment',
      setup(provider: TestGeminiProvider) {
        const inlineData = Buffer.from('pdf-bytes', 'utf8').toString('base64');
        provider.remoteAttachmentResponses.set('https://example.com/a.pdf', {
          data: inlineData,
          mimeType: 'application/pdf',
        });
      },
      messages: [
        {
          role: 'user' as const,
          content: 'summarize this file',
          attachments: ['https://example.com/a.pdf'],
          params: { mimetype: 'application/pdf' },
        },
      ] satisfies PromptMessage[],
    },
    {
      title: 'remote image attachment',
      setup(provider: TestGeminiProvider) {
        const inlineData = Buffer.from('image-bytes', 'utf8').toString(
          'base64'
        );
        provider.remoteAttachmentResponses.set('https://example.com/a.jpg', {
          data: inlineData,
          mimeType: 'image/jpeg',
        });
      },
      messages: [
        {
          role: 'user' as const,
          content: 'describe this image',
          attachments: ['https://example.com/a.jpg'],
        },
      ] satisfies PromptMessage[],
    },
    {
      title: 'downloaded audio webm attachment',
      setup(provider: TestGeminiProvider) {
        const inlineData = Buffer.from('audio-bytes', 'utf8').toString(
          'base64'
        );
        provider.remoteAttachmentResponses.set('https://example.com/a.webm', {
          data: inlineData,
          mimeType: 'audio/webm',
        });
      },
      messages: [
        {
          role: 'user' as const,
          content: 'transcribe this clip',
          attachments: ['https://example.com/a.webm'],
        },
      ] satisfies PromptMessage[],
    },
    {
      title: 'google file url attachment',
      setup() {},
      messages: [
        {
          role: 'user' as const,
          content: 'summarize this file',
          attachments: [
            'https://generativelanguage.googleapis.com/v1beta/files/file-123',
          ],
          params: { mimetype: 'application/pdf' },
        },
      ] satisfies PromptMessage[],
    },
  ] as const;

  for (const testCase of cases) {
    const provider = new TestGeminiProvider();
    testCase.setup(provider);

    const result = await getProviderRuntimeHost(provider).run.text(
      { modelId: 'gemini-2.5-flash' },
      testCase.messages
    );

    t.is(result, 'native', testCase.title);
    t.snapshot(
      {
        remoteAttachmentRequests: provider.remoteAttachmentRequests,
        content: provider.dispatchRequests[0]?.messages[0]?.content,
      },
      testCase.title
    );
  }
});

test('GeminiProvider should pass abort signal to remote attachment prefetch', async t => {
  const provider = new TestGeminiProvider();
  provider.remoteAttachmentResponses.set('https://example.com/a.jpg', {
    data: Buffer.from('image-bytes', 'utf8').toString('base64'),
    mimeType: 'image/jpeg',
  });
  const controller = new AbortController();

  await getProviderRuntimeHost(provider).run.text(
    { modelId: 'gemini-2.5-flash' },
    [
      {
        role: 'user',
        content: 'describe this image',
        attachments: ['https://example.com/a.jpg'],
      },
    ],
    { signal: controller.signal }
  );

  t.deepEqual(provider.remoteAttachmentRequests, ['https://example.com/a.jpg']);
  t.is(provider.remoteAttachmentSignals[0], controller.signal);
});

test('GeminiProvider should not pass materialized inline attachment URL to native request', async t => {
  const provider = new TestGeminiProvider();
  const inlineData = Buffer.from('image-bytes', 'utf8').toString('base64');
  provider.remoteAttachmentResponses.set('https://example.com/a.jpg', {
    data: inlineData,
    mimeType: 'image/jpeg',
  });

  await getProviderRuntimeHost(provider).run.text(
    { modelId: 'gemini-2.5-flash' },
    [
      {
        role: 'user',
        content: 'describe this image',
        attachments: ['https://example.com/a.jpg'],
      },
    ],
    {
      user: 'user-1',
      workspace: 'workspace-1',
      session: 'session-1',
    }
  );

  const content = provider.dispatchRequests[0]?.messages[0]?.content as Array<{
    type: string;
    source?: Record<string, unknown>;
  }>;
  const attachmentPart = content.find(part => part.type === 'image');

  t.deepEqual(provider.remoteAttachmentRequests, ['https://example.com/a.jpg']);
  t.is(attachmentPart?.source?.data, inlineData);
  t.is(attachmentPart?.source?.media_type, 'image/jpeg');
  t.false('url' in (attachmentPart?.source ?? {}));
});

test('GeminiProvider should reject unsupported attachment schemes at input validation', async t => {
  const provider = new TestGeminiProvider();

  const error = await t.throwsAsync(
    getProviderRuntimeHost(provider).run.text(
      { modelId: 'gemini-2.5-flash' },
      [
        {
          role: 'user',
          content: 'read this attachment',
          attachments: ['blob:https://example.com/file-id'],
          params: { mimetype: 'application/pdf' },
        },
      ],
      {}
    )
  );

  t.true(error instanceof CopilotPromptInvalid);
  t.regex(error.message, /attachments must use https\?:\/\/, gs:\/\/ or data:/);
  t.is(provider.dispatchRequests.length, 0);
});

test('GeminiProvider should validate malformed attachments before canonicalization', async t => {
  const provider = new TestGeminiProvider();

  const error = await t.throwsAsync(
    getProviderRuntimeHost(provider).run.text(
      { modelId: 'gemini-2.5-flash' },
      [
        {
          role: 'user',
          content: 'read this attachment',
          attachments: [{ kind: 'url' }],
        },
      ] as any,
      {}
    )
  );

  t.true(error instanceof CopilotPromptInvalid);
  t.regex(error.message, /attachments\[0\]/);
  t.is(provider.dispatchRequests.length, 0);
});

test('GeminiProvider should drive tool loop on native path', async t => {
  const provider = new TestGeminiProvider();
  provider.testTools = {
    doc_read: defineTool({
      inputSchema: z.object({ doc_id: z.string() }),
      execute: async args => ({ markdown: `# ${(args as any).doc_id}` }),
    }),
  };
  provider.dispatchFactory = request => {
    const hasToolResult = request.messages.some(
      message => message.role === 'tool'
    );
    if (!hasToolResult) {
      return [
        {
          type: 'tool_call',
          call_id: 'call_1',
          name: 'doc_read',
          arguments: { doc_id: 'a1' },
        },
        { type: 'done', finish_reason: 'tool_calls' },
      ];
    }

    return [
      { type: 'text_delta', text: 'after tool' },
      { type: 'done', finish_reason: 'stop' },
    ];
  };

  const result = await getProviderRuntimeHost(provider).run.text(
    { modelId: 'gemini-2.5-flash' },
    [{ role: 'user', content: 'read doc a1' }],
    {}
  );

  t.true(result.includes('after tool'));
  t.is(provider.dispatchRequests.length, 2);
  t.true(
    provider.dispatchRequests[1]?.messages.some(
      message => message.role === 'tool'
    )
  );
});

test('GeminiVertexProvider should prefetch bearer token for native config', async t => {
  const provider = new TestGeminiVertexProvider();
  const config = await provider.exposeNativeConfig();
  t.snapshot(config);
});

test('GeminiVertexProvider should materialize remote attachments before native text path', async t => {
  const cases = [
    {
      title: 'remote http url',
      url: 'https://example.com/a.mp3',
      data: Buffer.from('audio-bytes', 'utf8').toString('base64'),
      mimeType: 'audio/mpeg',
    },
    {
      title: 'gs url',
      url: 'gs://bucket/audio.opus',
      data: Buffer.from('opus-bytes', 'utf8').toString('base64'),
      mimeType: 'audio/opus',
    },
  ] as const;

  for (const testCase of cases) {
    const provider = new TestGeminiVertexProvider();
    provider.remoteAttachmentResponses.set(testCase.url, {
      data: testCase.data,
      mimeType: testCase.mimeType,
    });

    const result = await getProviderRuntimeHost(provider).run.text(
      { modelId: 'gemini-2.5-flash' },
      [
        {
          role: 'user',
          content: 'transcribe the audio',
          attachments: [testCase.url],
        },
      ],
      {}
    );

    t.is(result, 'vertex native', testCase.title);
    t.snapshot(
      {
        remoteAttachmentRequests: provider.remoteAttachmentRequests,
        content: provider.dispatchRequests[0]?.messages[0]?.content,
      },
      testCase.title
    );
  }
});

test('OpenAIProvider should use native structured dispatch', async t => {
  const provider = new TestOpenAIProvider();
  t.teardown(installNativeDispatchRecorder(provider));
  const schema = z.object({ summary: z.string() });

  const result = await getProviderRuntimeHost(provider).run.structured(
    { modelId: 'gpt-4.1' },
    jsonOnlyPromptMessages('Summarize AFFiNE in one sentence.'),
    structuredOptions(schema),
    structuredContract(schema)
  );

  t.is(provider.structuredRequests.length, 1);
  t.snapshot({
    result: JSON.parse(result),
    request: provider.structuredRequests[0],
  });
});

test('parseNativeStructuredOutput should require native output_json', t => {
  const error = t.throws(() =>
    parseNativeStructuredOutput({
      output_text: '{"summary":"AFFiNE"}',
    })
  );

  t.true(error instanceof Error);
  const structuredError = error as Error & {
    code?: string;
    name?: string;
  };
  t.is(structuredError.name, 'StructuredResponseParseError');
  t.is(structuredError.code, 'invalid_structured_output');
  t.regex(structuredError.message, /missing required output_json/);
});

test('OpenAIProvider should prefer native output_json for structured dispatch', async t => {
  const provider = new TestOpenAIProvider();
  t.teardown(installNativeDispatchRecorder(provider));
  provider.structuredFactory = request => ({
    id: 'structured_openai_output_json',
    model: request.model,
    output_text: 'not-json-anymore',
    output_json: { summary: 'AFFiNE structured' },
    usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
    finish_reason: 'stop',
  });

  const result = await getProviderRuntimeHost(provider).run.structured(
    { modelId: 'gpt-4.1' },
    jsonOnlyPromptMessages('Summarize AFFiNE in one sentence.'),
    structuredOptions(z.object({ summary: z.string() })),
    structuredContract(z.object({ summary: z.string() }))
  );

  t.snapshot(JSON.parse(result));
});

test('OpenAIProvider should use native embedding dispatch', async t => {
  const provider = new TestOpenAIProvider();
  t.teardown(installNativeDispatchRecorder(provider));

  const result = await getProviderRuntimeHost(provider).run.embedding(
    { modelId: 'text-embedding-3-small' },
    ['alpha', 'beta'],
    { dimensions: 8 }
  );

  t.is(provider.embeddingRequests.length, 1);
  t.snapshot({
    result,
    request: provider.embeddingRequests[0],
  });
});

test('OpenAIProvider should use native rerank dispatch', async t => {
  const provider = new TestOpenAIProvider();
  t.teardown(installNativeDispatchRecorder(provider));

  const scores = await getProviderRuntimeHost(provider).run.rerank(
    { modelId: 'gpt-4.1' },
    {
      query: 'programming',
      candidates: [
        { id: 'react', text: 'React is a UI library.' },
        { id: 'weather', text: 'The park is sunny today.' },
      ],
    }
  );

  t.is(provider.rerankRequests.length, 1);
  t.snapshot({ scores, request: provider.rerankRequests[0] });
});

test('OpenAIProvider rerank should normalize native dispatch errors', async t => {
  class ErroringOpenAIProvider extends TestOpenAIProvider {
    override rerankFactory = () => {
      throw new Error('native rerank exploded');
    };
  }

  const provider = new ErroringOpenAIProvider();
  t.teardown(installNativeDispatchRecorder(provider));

  const error = await t.throwsAsync(
    getProviderRuntimeHost(provider).run.rerank(
      { modelId: 'gpt-4.1' },
      {
        query: 'programming',
        candidates: [{ id: 'react', text: 'React is a UI library.' }],
      }
    )
  );

  t.true(error instanceof CopilotProviderSideError);
  t.regex(error.message, /native rerank exploded/i);
});
