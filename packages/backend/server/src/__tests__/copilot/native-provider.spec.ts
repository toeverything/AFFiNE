import test from 'ava';
import { z } from 'zod';

import { CopilotPromptInvalid, CopilotProviderSideError } from '../../base';
import type {
  NativeLlmBackendConfig,
  NativeLlmEmbeddingRequest,
  NativeLlmEmbeddingResponse,
  NativeLlmRequest,
  NativeLlmRerankRequest,
  NativeLlmRerankResponse,
  NativeLlmStreamEvent,
  NativeLlmStructuredRequest,
  NativeLlmStructuredResponse,
} from '../../native';
import { ProviderMiddlewareConfig } from '../../plugins/copilot/config';
import { GeminiProvider } from '../../plugins/copilot/providers/gemini/gemini';
import { GeminiVertexProvider } from '../../plugins/copilot/providers/gemini/vertex';
import {
  buildNativeRequest,
  NativeProviderAdapter,
} from '../../plugins/copilot/providers/native';
import { OpenAIProvider } from '../../plugins/copilot/providers/openai';
import { PerplexityProvider } from '../../plugins/copilot/providers/perplexity';
import {
  CopilotProviderType,
  ModelInputType,
  ModelOutputType,
  type PromptMessage,
} from '../../plugins/copilot/providers/types';
import type { CopilotToolSet } from '../../plugins/copilot/tools';

const mockDispatch = () =>
  (async function* (): AsyncIterableIterator<NativeLlmStreamEvent> {
    yield { type: 'text_delta', text: 'Use [^1] now' };
    yield { type: 'citation', index: 1, url: 'https://affine.pro' };
    yield { type: 'done', finish_reason: 'stop' };
  })();

function stream(
  factory: () => NativeLlmStreamEvent[]
): AsyncIterableIterator<NativeLlmStreamEvent> {
  return (async function* () {
    for (const event of factory()) {
      yield event;
    }
  })();
}

class TestGeminiProvider extends GeminiProvider<{ apiKey: string }> {
  override readonly type = CopilotProviderType.Gemini;
  override readonly models = [
    {
      id: 'gemini-2.5-flash',
      capabilities: [
        {
          input: [
            ModelInputType.Text,
            ModelInputType.Image,
            ModelInputType.Audio,
            ModelInputType.File,
          ],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
        },
      ],
    },
    {
      id: 'gemini-embedding-001',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Embedding],
        },
      ],
    },
  ];
  readonly dispatchRequests: NativeLlmRequest[] = [];
  readonly structuredRequests: NativeLlmStructuredRequest[] = [];
  readonly embeddingRequests: NativeLlmEmbeddingRequest[] = [];
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
  dispatchFactory: (request: NativeLlmRequest) => NativeLlmStreamEvent[] =
    () => [
      { type: 'text_delta', text: 'native' },
      { type: 'done', finish_reason: 'stop' },
    ];
  structuredFactory: (
    request: NativeLlmStructuredRequest
  ) => NativeLlmStructuredResponse = () => ({
    id: 'structured_1',
    model: 'gemini-2.5-flash',
    output_text: '{"summary":"AFFiNE native"}',
    usage: {
      prompt_tokens: 4,
      completion_tokens: 3,
      total_tokens: 7,
    },
    finish_reason: 'stop',
  });
  embeddingFactory: (
    request: NativeLlmEmbeddingRequest
  ) => NativeLlmEmbeddingResponse = request => ({
    model: request.model,
    embeddings: request.inputs.map((_, index) => [index + 0.1, index + 0.2]),
    usage: {
      prompt_tokens: request.inputs.length,
      total_tokens: request.inputs.length,
    },
  });

  override configured() {
    return true;
  }

  protected override async createNativeConfig(): Promise<NativeLlmBackendConfig> {
    return {
      base_url: 'https://generativelanguage.googleapis.com/v1beta',
      auth_token: 'api-key',
      request_layer: 'gemini_api',
    };
  }

  protected override createNativeDispatch(
    _backendConfig: NativeLlmBackendConfig
  ) {
    return (request: NativeLlmRequest) => {
      this.dispatchRequests.push(request);
      return stream(() => this.dispatchFactory(request));
    };
  }

  protected override createNativeStructuredDispatch(
    _backendConfig: NativeLlmBackendConfig
  ) {
    return async (request: NativeLlmStructuredRequest) => {
      this.structuredRequests.push(request);
      return this.structuredFactory(request);
    };
  }

  protected override createNativeEmbeddingDispatch(
    _backendConfig: NativeLlmBackendConfig
  ) {
    return async (request: NativeLlmEmbeddingRequest) => {
      this.embeddingRequests.push(request);
      return this.embeddingFactory(request);
    };
  }

  protected override async fetchRemoteAttach(
    url: string,
    signal?: AbortSignal
  ) {
    this.remoteAttachmentRequests.push(url);
    this.remoteAttachmentSignals.push(signal);
    const response = this.remoteAttachmentResponses.get(url);
    if (!response) {
      throw new Error(`missing remote attachment stub for ${url}`);
    }
    return response;
  }

  protected override async waitForStructuredRetry(delayMs: number) {
    this.retryDelays.push(delayMs);
  }

  protected override getActiveProviderMiddleware(): ProviderMiddlewareConfig {
    return this.testMiddleware;
  }

  protected override async getTools(): Promise<CopilotToolSet> {
    return this.testTools;
  }
}

class TestGeminiVertexProvider extends GeminiVertexProvider {
  testConfig = {
    location: 'us-central1',
    project: 'p1',
    googleAuthOptions: {},
  } as any;
  readonly dispatchRequests: NativeLlmRequest[] = [];
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

  protected override createNativeDispatch(
    _backendConfig: NativeLlmBackendConfig
  ) {
    return (request: NativeLlmRequest) => {
      this.dispatchRequests.push(request);
      return stream(() => [
        { type: 'text_delta', text: 'vertex native' },
        { type: 'done', finish_reason: 'stop' },
      ]);
    };
  }

  // eslint-disable-next-line sonarjs/no-identical-functions
  protected override async fetchRemoteAttach(
    url: string,
    signal?: AbortSignal
  ) {
    this.remoteAttachmentRequests.push(url);
    this.remoteAttachmentSignals.push(signal);
    const response = this.remoteAttachmentResponses.get(url);
    if (!response) {
      throw new Error(`missing remote attachment stub for ${url}`);
    }
    return response;
  }

  protected override getActiveProviderMiddleware(): ProviderMiddlewareConfig {
    return this.testMiddleware;
  }

  protected override async getTools(): Promise<CopilotToolSet> {
    return this.testTools;
  }

  async exposeNativeConfig() {
    return await this.createNativeConfig();
  }
}

class TestOpenAIProvider extends OpenAIProvider {
  override readonly models = [
    {
      id: 'gpt-4.1',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Structured,
            ModelOutputType.Rerank,
          ],
        },
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Embedding],
        },
      ],
    },
    {
      id: 'gpt-5.2',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Structured,
            ModelOutputType.Rerank,
          ],
        },
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Embedding],
        },
      ],
    },
    {
      id: 'text-embedding-3-small',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Embedding],
        },
      ],
    },
  ];

  readonly structuredRequests: NativeLlmStructuredRequest[] = [];
  readonly embeddingRequests: NativeLlmEmbeddingRequest[] = [];
  readonly rerankRequests: NativeLlmRerankRequest[] = [];
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

  protected override getActiveProviderMiddleware(): ProviderMiddlewareConfig {
    return this.testMiddleware;
  }

  protected override createNativeStructuredDispatch(
    _backendConfig: NativeLlmBackendConfig
  ) {
    return async (request: NativeLlmStructuredRequest) => {
      this.structuredRequests.push(request);
      return {
        id: 'structured_openai_1',
        model: request.model,
        output_text: '{"summary":"AFFiNE structured"}',
        usage: {
          prompt_tokens: 4,
          completion_tokens: 3,
          total_tokens: 7,
        },
        finish_reason: 'stop',
      };
    };
  }

  protected override createNativeEmbeddingDispatch(
    _backendConfig: NativeLlmBackendConfig
  ) {
    return async (request: NativeLlmEmbeddingRequest) => {
      this.embeddingRequests.push(request);
      return {
        model: request.model,
        embeddings: request.inputs.map(() => [0.4, 0.5]),
        usage: {
          prompt_tokens: request.inputs.length,
          total_tokens: request.inputs.length,
        },
      };
    };
  }

  protected override createNativeRerankDispatch(
    _backendConfig: NativeLlmBackendConfig
  ) {
    return async (request: NativeLlmRerankRequest) => {
      this.rerankRequests.push(request);
      return {
        model: request.model,
        scores: request.candidates.map(() => 0.8),
      } satisfies NativeLlmRerankResponse;
    };
  }
}

class TestPerplexityProvider extends PerplexityProvider {
  override get config() {
    return { apiKey: 'perplexity-key' };
  }

  override configured() {
    return true;
  }
}

test('NativeProviderAdapter streamText should append citation footnotes', async t => {
  const adapter = new NativeProviderAdapter(mockDispatch, {}, 3);
  const chunks: string[] = [];
  for await (const chunk of adapter.streamText({
    model: 'gpt-5-mini',
    stream: true,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })) {
    chunks.push(chunk);
  }

  const text = chunks.join('');
  t.true(text.includes('Use [^1] now'));
  t.true(
    text.includes('[^1]: {"type":"url","url":"https%3A%2F%2Faffine.pro"}')
  );
});

test('NativeProviderAdapter streamObject should append citation footnotes', async t => {
  const adapter = new NativeProviderAdapter(mockDispatch, {}, 3);
  const chunks = [];
  for await (const chunk of adapter.streamObject({
    model: 'gpt-5-mini',
    stream: true,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })) {
    chunks.push(chunk);
  }

  t.deepEqual(
    chunks.map(chunk => chunk.type),
    ['text-delta', 'text-delta']
  );
  const text = chunks
    .filter(chunk => chunk.type === 'text-delta')
    .map(chunk => chunk.textDelta)
    .join('');
  t.true(text.includes('Use [^1] now'));
  t.true(
    text.includes('[^1]: {"type":"url","url":"https%3A%2F%2Faffine.pro"}')
  );
});

test('NativeProviderAdapter streamObject should append fallback attachment footnotes', async t => {
  const dispatch = () =>
    (async function* (): AsyncIterableIterator<NativeLlmStreamEvent> {
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

  const adapter = new NativeProviderAdapter(dispatch, {}, 3);
  const chunks = [];
  for await (const chunk of adapter.streamObject({
    model: 'gpt-5-mini',
    stream: true,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })) {
    chunks.push(chunk);
  }

  const text = chunks
    .filter(chunk => chunk.type === 'text-delta')
    .map(chunk => chunk.textDelta)
    .join('');
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
});

test('NativeProviderAdapter streamObject should map tool and text events', async t => {
  let round = 0;
  const dispatch = (_request: NativeLlmRequest) =>
    (async function* (): AsyncIterableIterator<NativeLlmStreamEvent> {
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
    dispatch,
    {
      doc_read: {
        inputSchema: z.object({ doc_id: z.string() }),
        execute: async () => ({ markdown: '# a1' }),
      },
    },
    4
  );

  const events = [];
  for await (const event of adapter.streamObject({
    model: 'gpt-5-mini',
    stream: true,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'read' }] }],
  })) {
    events.push(event);
  }

  t.deepEqual(
    events.map(event => event.type),
    ['tool-call', 'tool-result', 'text-delta']
  );
  t.deepEqual(events[0], {
    type: 'tool-call',
    toolCallId: 'call_1',
    toolName: 'doc_read',
    args: { doc_id: 'a1' },
  });
});

test('buildNativeRequest should include rust middleware from profile', async t => {
  const { request } = await buildNativeRequest({
    model: 'gpt-5-mini',
    messages: [{ role: 'user', content: 'hello' }],
    tools: {},
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

test('buildNativeRequest should preserve non-image attachment urls for native Gemini', async t => {
  const { request } = await buildNativeRequest({
    model: 'gemini-2.5-flash',
    messages: [
      {
        role: 'user',
        content: 'summarize this attachment',
        attachments: ['https://example.com/a.pdf'],
        params: { mimetype: 'application/pdf' },
      },
    ],
  });

  t.deepEqual(request.messages[0]?.content, [
    { type: 'text', text: 'summarize this attachment' },
    {
      type: 'file',
      source: {
        url: 'https://example.com/a.pdf',
        media_type: 'application/pdf',
      },
    },
  ]);
});

test('buildNativeRequest should inline data url attachments for native Gemini', async t => {
  const { request } = await buildNativeRequest({
    model: 'gemini-2.5-flash',
    messages: [
      {
        role: 'user',
        content: 'read this note',
        attachments: ['data:text/plain,hello%20world'],
        params: { mimetype: 'text/plain' },
      },
    ],
  });

  t.deepEqual(request.messages[0]?.content, [
    { type: 'text', text: 'read this note' },
    {
      type: 'file',
      source: {
        media_type: 'text/plain',
        data: Buffer.from('hello world', 'utf8').toString('base64'),
      },
    },
  ]);
});

test('buildNativeRequest should classify audio attachments for native Gemini', async t => {
  const { request } = await buildNativeRequest({
    model: 'gemini-2.5-flash',
    messages: [
      {
        role: 'user',
        content: 'transcribe this clip',
        attachments: ['https://example.com/a.mp3'],
        params: { mimetype: 'audio/mpeg' },
      },
    ],
  });

  t.deepEqual(request.messages[0]?.content, [
    { type: 'text', text: 'transcribe this clip' },
    {
      type: 'audio',
      source: {
        url: 'https://example.com/a.mp3',
        media_type: 'audio/mpeg',
      },
    },
  ]);
});

test('buildNativeRequest should preserve bytes and file handle attachment sources', async t => {
  const { request } = await buildNativeRequest({
    model: 'gemini-2.5-flash',
    messages: [
      {
        role: 'user',
        content: 'inspect these assets',
        attachments: [
          {
            kind: 'bytes',
            data: Buffer.from('hello', 'utf8').toString('base64'),
            mimeType: 'text/plain',
            fileName: 'hello.txt',
          },
          {
            kind: 'file_handle',
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
  });

  t.deepEqual(request.messages[0]?.content, [
    { type: 'text', text: 'inspect these assets' },
    {
      type: 'file',
      source: {
        media_type: 'text/plain',
        data: Buffer.from('hello', 'utf8').toString('base64'),
        file_name: 'hello.txt',
      },
    },
    {
      type: 'file',
      source: {
        file_handle: 'file_123',
        media_type: 'application/pdf',
        file_name: 'report.pdf',
      },
    },
  ]);
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
  const schema = z.object({ summary: z.string() });

  await provider.structure(
    { modelId: 'gpt-4.1' },
    [
      {
        role: 'system',
        content: 'Return JSON only.',
      },
      {
        role: 'user',
        content: 'Summarize AFFiNE in one sentence.',
      },
    ],
    { schema }
  );

  t.deepEqual(provider.structuredRequests[0]?.schema, {
    type: 'object',
    properties: { summary: { type: 'string' } },
    required: ['summary'],
    additionalProperties: false,
  });
});

test('buildNativeStructuredRequest should preserve caller strictness override', async t => {
  const provider = new TestOpenAIProvider();

  await provider.structure(
    { modelId: 'gpt-4.1' },
    [
      { role: 'system', content: 'Return JSON only.' },
      { role: 'user', content: 'Summarize AFFiNE in one sentence.' },
    ],
    { schema: z.object({ summary: z.string() }), strict: false }
  );

  t.is(provider.structuredRequests[0]?.strict, false);
});

test('NativeProviderAdapter streamText should skip citation footnotes when disabled', async t => {
  const adapter = new NativeProviderAdapter(mockDispatch, {}, 3, {
    nodeTextMiddleware: ['callout'],
  });
  const chunks: string[] = [];
  for await (const chunk of adapter.streamText({
    model: 'gpt-5-mini',
    stream: true,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
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

  const result = await provider.text(
    { modelId: 'gemini-2.5-flash' },
    [{ role: 'user', content: 'hello' }],
    { reasoning: true }
  );

  t.is(result, 'native');
  t.is(provider.dispatchRequests.length, 1);
  t.deepEqual(provider.dispatchRequests[0]?.reasoning, {
    include_thoughts: true,
    thinking_budget: 12000,
  });
  t.deepEqual(provider.dispatchRequests[0]?.middleware, {
    request: ['normalize_messages', 'tool_schema_rewrite'],
    stream: ['stream_event_normalize', 'citation_indexing'],
  });
});

test('GeminiProvider should use native path for structured requests', async t => {
  const provider = new TestGeminiProvider();

  const schema = z.object({ summary: z.string() });
  const result = await provider.structure(
    { modelId: 'gemini-2.5-flash' },
    [
      {
        role: 'system',
        content: 'Return JSON only.',
      },
      {
        role: 'user',
        content: 'Summarize AFFiNE in one short sentence.',
      },
    ],
    { schema }
  );

  t.is(provider.structuredRequests.length, 1);
  t.deepEqual(provider.structuredRequests[0]?.schema, {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
      },
    },
    required: ['summary'],
    additionalProperties: false,
  });
  t.deepEqual(JSON.parse(result), { summary: 'AFFiNE native' });
});

test('GeminiProvider should retry only reparsable structured responses', async t => {
  const provider = new TestGeminiProvider();
  let attempts = 0;
  provider.structuredFactory = () => {
    attempts += 1;
    return {
      id: `structured_retry_${attempts}`,
      model: 'gemini-2.5-flash',
      output_text:
        attempts === 1 ? '```json\n{"summary":1}\n```' : '{"summary":"ok"}',
      usage: {
        prompt_tokens: 4,
        completion_tokens: 3,
        total_tokens: 7,
      },
      finish_reason: 'stop',
    };
  };

  const result = await provider.structure(
    { modelId: 'gemini-2.5-flash' },
    [
      {
        role: 'system',
        content: 'Return JSON only.',
      },
      {
        role: 'user',
        content: 'Summarize AFFiNE in one short sentence.',
      },
    ],
    { schema: z.object({ summary: z.string() }), maxRetries: 2 }
  );

  t.is(attempts, 2);
  t.deepEqual(JSON.parse(result), { summary: 'ok' });
});

test('GeminiProvider should treat maxRetries as retry count for backend failures', async t => {
  const provider = new TestGeminiProvider();
  let attempts = 0;
  provider.structuredFactory = () => {
    attempts += 1;
    throw new Error('backend down');
  };

  const error = await t.throwsAsync(
    provider.structure(
      { modelId: 'gemini-2.5-flash' },
      [
        {
          role: 'system',
          content: 'Return JSON only.',
        },
        {
          role: 'user',
          content: 'Summarize AFFiNE in one short sentence.',
        },
      ],
      { schema: z.object({ summary: z.string() }), maxRetries: 2 }
    )
  );

  t.is(attempts, 3);
  t.deepEqual(provider.retryDelays, [2_000, 4_000]);
  t.regex(error.message, /backend down/);
});

test('GeminiProvider should use native structured path for audio attachments', async t => {
  const provider = new TestGeminiProvider();
  const inlineData = Buffer.from('audio-bytes', 'utf8').toString('base64');
  provider.remoteAttachmentResponses.set('https://example.com/a.mp3', {
    data: inlineData,
    mimeType: 'audio/mpeg',
  });
  provider.structuredFactory = () => ({
    id: 'structured_audio_1',
    model: 'gemini-2.5-flash',
    output_text: '[{"a":"Speaker 1","s":0,"e":1,"t":"Hello"}]',
    usage: {
      prompt_tokens: 4,
      completion_tokens: 3,
      total_tokens: 7,
    },
    finish_reason: 'stop',
  });

  const result = await provider.structure(
    { modelId: 'gemini-2.5-flash' },
    [
      {
        role: 'system',
        content: 'Return JSON only.',
      },
      {
        role: 'user',
        content: 'transcribe the audio',
        attachments: ['https://example.com/a.mp3'],
        params: { mimetype: 'audio/mpeg' },
      },
    ],
    {
      schema: z.array(
        z.object({ a: z.string(), s: z.number(), e: z.number(), t: z.string() })
      ),
    }
  );

  t.is(provider.structuredRequests.length, 1);
  t.deepEqual(provider.structuredRequests[0]?.messages[1]?.content, [
    { type: 'text', text: 'transcribe the audio' },
    {
      type: 'audio',
      source: {
        data: inlineData,
        media_type: 'audio/mpeg',
      },
    },
  ]);
  t.deepEqual(provider.remoteAttachmentRequests, ['https://example.com/a.mp3']);
  t.deepEqual(JSON.parse(result), [{ a: 'Speaker 1', s: 0, e: 1, t: 'Hello' }]);
});

test('GeminiProvider should use native path for embeddings', async t => {
  const provider = new TestGeminiProvider();

  const result = await provider.embedding(
    { modelId: 'gemini-embedding-001' },
    ['first', 'second'],
    { dimensions: 3 }
  );

  t.deepEqual(result, [
    [0.1, 0.2],
    [1.1, 1.2],
  ]);
  t.is(provider.embeddingRequests.length, 1);
  t.deepEqual(provider.embeddingRequests[0], {
    model: 'gemini-embedding-001',
    inputs: ['first', 'second'],
    dimensions: 3,
    task_type: 'RETRIEVAL_DOCUMENT',
  });
});

test('GeminiProvider should use native path for non-image attachments', async t => {
  const provider = new TestGeminiProvider();
  const inlineData = Buffer.from('pdf-bytes', 'utf8').toString('base64');
  provider.remoteAttachmentResponses.set('https://example.com/a.pdf', {
    data: inlineData,
    mimeType: 'application/pdf',
  });
  const messages: PromptMessage[] = [
    {
      role: 'user',
      content: 'summarize this file',
      attachments: ['https://example.com/a.pdf'],
      params: { mimetype: 'application/pdf' },
    },
  ];

  const result = await provider.text(
    { modelId: 'gemini-2.5-flash' },
    messages,
    {}
  );

  t.is(result, 'native');
  t.is(provider.dispatchRequests.length, 1);
  t.deepEqual(provider.dispatchRequests[0]?.messages[0]?.content, [
    { type: 'text', text: 'summarize this file' },
    {
      type: 'file',
      source: {
        data: inlineData,
        media_type: 'application/pdf',
      },
    },
  ]);
});

test('GeminiProvider should inline remote image attachments for text requests', async t => {
  const provider = new TestGeminiProvider();
  const inlineData = Buffer.from('image-bytes', 'utf8').toString('base64');
  provider.remoteAttachmentResponses.set('https://example.com/a.jpg', {
    data: inlineData,
    mimeType: 'image/jpeg',
  });

  const result = await provider.text({ modelId: 'gemini-2.5-flash' }, [
    {
      role: 'user',
      content: 'describe this image',
      attachments: ['https://example.com/a.jpg'],
    },
  ]);

  t.is(result, 'native');
  t.deepEqual(provider.dispatchRequests[0]?.messages[0]?.content, [
    { type: 'text', text: 'describe this image' },
    {
      type: 'image',
      source: {
        data: inlineData,
        media_type: 'image/jpeg',
      },
    },
  ]);
});

test('GeminiProvider should pass abort signal to remote attachment prefetch', async t => {
  const provider = new TestGeminiProvider();
  provider.remoteAttachmentResponses.set('https://example.com/a.jpg', {
    data: Buffer.from('image-bytes', 'utf8').toString('base64'),
    mimeType: 'image/jpeg',
  });
  const controller = new AbortController();

  await provider.text(
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

test('GeminiProvider should classify downloaded audio-only WebM attachments as audio', async t => {
  const provider = new TestGeminiProvider();
  const inlineData = Buffer.from('audio-bytes', 'utf8').toString('base64');
  provider.remoteAttachmentResponses.set('https://example.com/a.webm', {
    data: inlineData,
    mimeType: 'audio/webm',
  });

  const result = await provider.text(
    { modelId: 'gemini-2.5-flash' },
    [
      {
        role: 'user',
        content: 'transcribe this clip',
        attachments: ['https://example.com/a.webm'],
      },
    ],
    {}
  );

  t.is(result, 'native');
  t.deepEqual(provider.dispatchRequests[0]?.messages[0]?.content, [
    { type: 'text', text: 'transcribe this clip' },
    { type: 'audio', source: { data: inlineData, media_type: 'audio/webm' } },
  ]);
});

test('GeminiProvider should preserve Google file urls for native Gemini API', async t => {
  const provider = new TestGeminiProvider();

  await provider.text({ modelId: 'gemini-2.5-flash' }, [
    {
      role: 'user',
      content: 'summarize this file',
      attachments: [
        'https://generativelanguage.googleapis.com/v1beta/files/file-123',
      ],
      params: { mimetype: 'application/pdf' },
    },
  ]);

  t.deepEqual(provider.remoteAttachmentRequests, []);
  t.deepEqual(provider.dispatchRequests[0]?.messages[0]?.content, [
    { type: 'text', text: 'summarize this file' },
    {
      type: 'file',
      source: {
        url: 'https://generativelanguage.googleapis.com/v1beta/files/file-123',
        media_type: 'application/pdf',
      },
    },
  ]);
});

test('PerplexityProvider should ignore attachments during text model matching', async t => {
  const provider = new TestPerplexityProvider();
  let capturedRequest: NativeLlmRequest | undefined;

  (provider as any).getActiveProviderMiddleware = () => ({});
  (provider as any).getTools = async () => ({});
  (provider as any).createNativeAdapter = () => ({
    text: async (request: NativeLlmRequest) => {
      capturedRequest = request;
      return 'ok';
    },
  });

  const result = await provider.text(
    { modelId: 'sonar' },
    [
      {
        role: 'user',
        content: 'summarize this',
        attachments: ['https://example.com/a.pdf'],
        params: { mimetype: 'application/pdf' },
      },
    ],
    {}
  );

  t.is(result, 'ok');
  t.deepEqual(capturedRequest?.messages[0]?.content, [
    { type: 'text', text: 'summarize this' },
  ]);
});

test('GeminiProvider should reject unsupported attachment schemes at input validation', async t => {
  const provider = new TestGeminiProvider();

  const error = await t.throwsAsync(
    provider.text(
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
    provider.text(
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
    doc_read: {
      inputSchema: z.object({ doc_id: z.string() }),
      execute: async args => ({ markdown: `# ${(args as any).doc_id}` }),
    },
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

  const result = await provider.text(
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

  t.deepEqual(config, {
    base_url: 'https://vertex.example',
    auth_token: 'vertex-token',
    request_layer: 'gemini_vertex',
  });
});

test('GeminiVertexProvider should preserve remote http attachments like Vertex SDK', async t => {
  const provider = new TestGeminiVertexProvider();

  const result = await provider.text(
    { modelId: 'gemini-2.5-flash' },
    [
      {
        role: 'user',
        content: 'transcribe the audio',
        attachments: ['https://example.com/a.mp3'],
      },
    ],
    {}
  );

  t.is(result, 'vertex native');
  t.deepEqual(provider.remoteAttachmentRequests, []);
  t.deepEqual(provider.dispatchRequests[0]?.messages[0]?.content, [
    { type: 'text', text: 'transcribe the audio' },
    {
      type: 'audio',
      source: {
        url: 'https://example.com/a.mp3',
        media_type: 'audio/mpeg',
      },
    },
  ]);
});

test('GeminiVertexProvider should preserve gs urls for native Vertex requests', async t => {
  const provider = new TestGeminiVertexProvider();

  const result = await provider.text(
    { modelId: 'gemini-2.5-flash' },
    [
      {
        role: 'user',
        content: 'transcribe the audio',
        attachments: ['gs://bucket/audio.opus'],
      },
    ],
    {}
  );

  t.is(result, 'vertex native');
  t.deepEqual(provider.remoteAttachmentRequests, []);
  t.deepEqual(provider.dispatchRequests[0]?.messages[0]?.content, [
    { type: 'text', text: 'transcribe the audio' },
    {
      type: 'audio',
      source: {
        url: 'gs://bucket/audio.opus',
        media_type: 'audio/opus',
      },
    },
  ]);
});

test('OpenAIProvider should use native structured dispatch', async t => {
  const provider = new TestOpenAIProvider();
  const schema = z.object({ summary: z.string() });

  const result = await provider.structure(
    { modelId: 'gpt-4.1' },
    [
      {
        role: 'system',
        content: 'Return JSON only.',
      },
      {
        role: 'user',
        content: 'Summarize AFFiNE in one sentence.',
      },
    ],
    { schema }
  );

  t.deepEqual(JSON.parse(result), { summary: 'AFFiNE structured' });
  t.is(provider.structuredRequests.length, 1);
  t.deepEqual(provider.structuredRequests[0]?.schema, {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
      },
    },
    required: ['summary'],
    additionalProperties: false,
  });
});

test('OpenAIProvider should use native embedding dispatch', async t => {
  const provider = new TestOpenAIProvider();

  const result = await provider.embedding(
    { modelId: 'text-embedding-3-small' },
    ['alpha', 'beta'],
    { dimensions: 8 }
  );

  t.deepEqual(result, [
    [0.4, 0.5],
    [0.4, 0.5],
  ]);
  t.is(provider.embeddingRequests.length, 1);
  t.deepEqual(provider.embeddingRequests[0], {
    model: 'text-embedding-3-small',
    inputs: ['alpha', 'beta'],
    dimensions: 8,
    task_type: 'RETRIEVAL_DOCUMENT',
  });
});

test('OpenAIProvider should use native rerank dispatch', async t => {
  const provider = new TestOpenAIProvider();

  const scores = await provider.rerank(
    { modelId: 'gpt-4.1' },
    {
      query: 'programming',
      candidates: [
        { id: 'react', text: 'React is a UI library.' },
        { id: 'weather', text: 'The park is sunny today.' },
      ],
    }
  );

  t.deepEqual(scores, [0.8, 0.8]);
  t.is(provider.rerankRequests.length, 1);
  t.is(provider.rerankRequests[0]?.model, 'gpt-4.1');
  t.is(provider.rerankRequests[0]?.query, 'programming');
  t.deepEqual(provider.rerankRequests[0]?.candidates, [
    { id: 'react', text: 'React is a UI library.' },
    { id: 'weather', text: 'The park is sunny today.' },
  ]);
});

test('OpenAIProvider rerank should normalize native dispatch errors', async t => {
  class ErroringOpenAIProvider extends TestOpenAIProvider {
    protected override createNativeRerankDispatch(
      _backendConfig: NativeLlmBackendConfig
    ) {
      return async () => {
        throw new Error('native rerank exploded');
      };
    }
  }

  const provider = new ErroringOpenAIProvider();

  const error = await t.throwsAsync(
    provider.rerank(
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
