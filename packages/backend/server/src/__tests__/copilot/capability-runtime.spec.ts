import { Readable } from 'node:stream';

import ava from 'ava';
import Sinon from 'sinon';
import { z } from 'zod';

import { Config, CopilotQuotaExceeded } from '../../base';
import type { BackendRuntimeProvider } from '../../core/backend-runtime';
import { StorageRuntimeProvider } from '../../core/storage-runtime';
import type { Models } from '../../models';
import type { ByokEntitlementPolicy } from '../../plugins/copilot/byok';
import type { ConversationPolicy } from '../../plugins/copilot/conversation/policy';
import { CapabilityRuntime } from '../../plugins/copilot/runtime/capability-runtime';
import { CopilotRuntimeEventConsumer } from '../../plugins/copilot/runtime/copilot-runtime-event-consumer';
import { AttachmentAdmissionHost } from '../../plugins/copilot/runtime/hosts/attachment-admission';
import { AttachmentMaterializer } from '../../plugins/copilot/runtime/hosts/attachment-materializer';
import { executeToolCall } from '../../plugins/copilot/runtime/tool/bridge';
import type { ToolRuntime } from '../../plugins/copilot/runtime/tool-runtime';
import { CopilotStorage } from '../../plugins/copilot/storage';

const test = ava;

async function collect<T>(source: AsyncIterable<T>) {
  const values: T[] = [];
  for await (const value of source) values.push(value);
  return values;
}

function runtimeFixture(streamError?: string, enabled = true) {
  const calls: Array<{
    slot: string;
    request?: unknown;
    targetOverride?: { profileId: string; modelId: string };
  }> = [];
  const backend = {
    executeCopilot: async (input: {
      slot: string;
      request: unknown;
      targetOverride?: { profileId: string; modelId: string };
    }) => {
      calls.push(input);
      if (input.slot === 'index.embedding')
        return { events: [], result: { embeddings: [[1, 2]] } };
      if (input.slot === 'search.rerank')
        return { events: [], result: { scores: [0.9] } };
      if (input.slot === 'prompt.structured')
        return {
          events: [],
          result: {
            output_json: { text: 'hello' },
            output_text: '{"text":"hello"}',
          },
        };
      if (
        input.slot === 'image.generate' ||
        input.slot === 'action.image.filter.sketch'
      ) {
        return {
          events: [],
          result: {
            images: [
              { url: 'https://example.com/image.png', media_type: 'image/png' },
            ],
          },
        };
      }
      throw new Error(`unexpected slot ${input.slot}`);
    },
    streamCopilot: (input: {
      slot: string;
      request: unknown;
      targetOverride?: { profileId: string; modelId: string };
    }) => {
      calls.push(input);
      async function* events() {
        if (streamError) {
          yield { type: 'error', message: streamError };
          return;
        }
        yield { type: 'message_start', model: 'opaque/model' };
        yield { type: 'text_delta', text: 'hello' };
        yield { type: 'done', finish_reason: 'stop' };
      }
      return events();
    },
    assertCopilotRoute: async () => {
      throw new Error('access_unavailable');
    },
  } as unknown as BackendRuntimeProvider;
  const entitlement = {
    hasServerEntitlement: async () => true,
    hasLocalEntitlement: async () => true,
    hasAiPlan: async () => false,
  } as unknown as ByokEntitlementPolicy;
  const conversation = {
    hasQuota: async () => true,
  } as unknown as ConversationPolicy;
  const tools = { getTools: async () => ({}) } as unknown as ToolRuntime;
  const consumer = {
    consume: async () => {},
  } as unknown as CopilotRuntimeEventConsumer;
  const config = { copilot: { enabled } } as Config;
  const storageRuntime = Sinon.createStubInstance(StorageRuntimeProvider);
  storageRuntime.getObject.callsFake(async () => ({
    body: Readable.from(Buffer.from('image')),
    metadata: {
      contentType: 'image/png',
      contentLength: 5,
      lastModified: new Date(0),
    },
  }));
  const storage = new CopilotStorage(storageRuntime);
  const materializer = Sinon.createStubInstance(AttachmentMaterializer);
  materializer.fetchRemoteAttachment.resolves({
    data: 'aW1hZ2U=',
    mimeType: 'image/png',
  });
  return {
    calls,
    storageRuntime,
    storage,
    materializer,
    runtime: new CapabilityRuntime(
      backend,
      entitlement,
      conversation,
      tools,
      consumer,
      config,
      new AttachmentAdmissionHost(materializer, storage)
    ),
  };
}

test('disabled copilot rejects native execution before route access', async t => {
  const { runtime, calls, materializer } = runtimeFixture(undefined, false);

  t.false(await runtime.embeddingConfigured('ignored'));
  await t.throwsAsync(runtime.embed('ignored', ['text']), {
    message: 'Copilot is disabled.',
  });
  await t.throwsAsync(
    async () =>
      await collect(
        runtime.streamText({}, [
          {
            role: 'user',
            content: 'hello',
            attachments: ['https://example.com/image.png'],
          },
        ])
      ),
    {
      message: 'Copilot is disabled.',
    }
  );
  t.false(materializer.fetchRemoteAttachment.called);
  t.deepEqual(calls, []);
});

test('all operation kinds enter the native slot pipeline', async t => {
  const { runtime, calls } = runtimeFixture();
  t.deepEqual(await runtime.embed('ignored', ['text']), [[1, 2]]);
  t.deepEqual(
    await runtime.rerank('ignored', {
      query: 'query',
      candidates: [{ id: 'one', text: 'text' }],
    }),
    [0.9]
  );
  t.deepEqual(
    await collect(
      runtime.streamImageArtifacts(
        {},
        [{ role: 'user', content: 'draw' }],
        {},
        undefined,
        'action.image.filter.sketch'
      )
    ),
    [{ url: 'https://example.com/image.png', media_type: 'image/png' }]
  );
  t.deepEqual(
    calls.map(call => call.slot),
    ['index.embedding', 'search.rerank', 'action.image.filter.sketch']
  );
});

test('image request builder receives serializable options and materialized attachments', async t => {
  const { runtime, calls, storage, storageRuntime, materializer } =
    runtimeFixture();
  const controller = new AbortController();

  await collect(
    runtime.streamImageArtifacts({}, [{ role: 'user', content: 'draw' }], {
      quality: 'high',
      seed: 42,
      modelName: 'stabilityai/stable-diffusion-xl-base-1.0',
      loras: [{ path: 'https://example.com/sketch.safetensors', scale: 1 }],
      signal: controller.signal,
      user: 'user-1',
    })
  );

  t.deepEqual(calls[0].request, {
    model: 'route-selected',
    prompt: 'draw',
    operation: 'generate',
    options: {
      quality: 'high',
      outputFormat: 'webp',
      seed: 42,
    },
    providerOptions: {
      provider: 'fal',
      options: {
        model_name: 'stabilityai/stable-diffusion-xl-base-1.0',
        loras: [{ path: 'https://example.com/sketch.safetensors', scale: 1 }],
      },
    },
  });

  const locator = storage.sessionAttachmentUrl(
    'session-1',
    'workspace-1',
    'image'
  );
  for (const attachment of [
    locator,
    { attachment: locator, mimeType: 'image/png' },
    { kind: 'url' as const, url: locator },
    'https://example.com/input.png',
  ]) {
    await collect(
      runtime.streamImageArtifacts(
        {},
        [{ role: 'user', content: 'edit', attachments: [attachment] }],
        {
          user: 'user-1',
          workspace: 'workspace-1',
          session: 'session-1',
        }
      )
    );
    t.like(calls.at(-1)?.request, {
      operation: 'edit',
      images: [
        {
          kind: 'bytes',
          data: [...Buffer.from('image')],
          mediaType: 'image/png',
        },
      ],
    });
  }
  t.is(storageRuntime.getObject.callCount, 3);
  t.true(
    storageRuntime.getObject.alwaysCalledWithExactly(
      'copilot',
      'user-1/workspace-1/image'
    )
  );
  t.true(materializer.fetchRemoteAttachment.calledOnce);
  await t.throwsAsync(
    async () =>
      await collect(
        runtime.streamImageArtifacts(
          {},
          [{ role: 'user', content: 'edit', attachments: [locator] }],
          {
            user: 'user-1',
            workspace: 'workspace-2',
            session: 'session-1',
          }
        )
      ),
    { message: 'Copilot attachment scope mismatch' }
  );
  t.is(calls.length, 5);
});

test('chat and structured requests materialize attachments and consume native results', async t => {
  const { runtime, calls, storage } = runtimeFixture();
  const chunks = await collect(
    runtime.streamText({ profileId: 'profile-1', modelId: 'vendor/model:B' }, [
      { role: 'user', content: 'hello' },
    ])
  );
  t.is(chunks.join(''), 'hello');
  t.is(calls[0].slot, 'chat.default');
  t.deepEqual(calls[0].targetOverride, {
    profileId: 'profile-1',
    modelId: 'vendor/model:B',
  });
  const messages = [
    {
      role: 'user' as const,
      content: 'hello',
      attachments: [
        storage.sessionAttachmentUrl('session-1', 'workspace-1', 'image'),
      ],
    },
  ];
  const options = {
    user: 'user-1',
    workspace: 'workspace-1',
    session: 'session-1',
  };
  await collect(runtime.streamText({}, messages, options));
  await collect(runtime.streamObject({}, messages, options));
  await runtime.generateStructured({}, messages, options, undefined, {
    responseSchemaJson: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    schemaHash: 'test',
  });
  for (const call of calls.slice(1)) {
    t.like(call.request, {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'hello' },
            {
              type: 'image',
              source: { media_type: 'image/png', data: 'aW1hZ2U=' },
            },
          ],
        },
      ],
    });
    t.false(JSON.stringify(call.request).includes('/api/copilot/'));
  }
  t.true(messages[0].attachments[0].startsWith('/api/copilot/'));
  await t.throwsAsync(runtime.assertRoute('chat.default', {}, {}), {
    instanceOf: CopilotQuotaExceeded,
  });
  const denied = runtimeFixture('access_unavailable').runtime;
  await t.throwsAsync(
    async () =>
      await collect(
        denied.streamText({}, [{ role: 'user', content: 'denied' }])
      ),
    { instanceOf: CopilotQuotaExceeded }
  );
});

test('product event consumer records route activity and real usage', async t => {
  const records: unknown[] = [];
  const activity: string[] = [];
  const failures: string[] = [];
  const models = {
    copilotUsage: { create: async (value: unknown) => records.push(value) },
    copilotWorkspaceByokConfig: {
      touchUsed: async (_workspaceId: string, profileId: string) =>
        activity.push(profileId),
      markFailure: async (
        _workspaceId: string,
        _profileId: string,
        errorKind: string
      ) => failures.push(errorKind),
    },
  } as unknown as Models;
  const consumer = new CopilotRuntimeEventConsumer(models);
  const route = {
    profileId: 'profile-1',
    source: 'server' as const,
    provider: 'openai',
    model: 'opaque/model:B',
  };
  await consumer.consume(
    [
      {
        type: 'usage',
        route,
        usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
      },
      { type: 'route_selected', route },
    ],
    { workspaceId: 'workspace-1', featureKind: 'chat' }
  );
  t.like(records[0], {
    workspaceId: 'workspace-1',
    provider: 'openai',
    providerSource: 'byok_server',
    model: 'opaque/model:B',
    promptTokens: 3,
    completionTokens: 2,
    totalTokens: 5,
  });
  t.deepEqual(activity, ['profile-1']);

  await consumer.consume(
    [{ type: 'route_selected', route: { ...route, profileId: 'profile-2' } }],
    { workspaceId: 'workspace-1', featureKind: 'chat' }
  );
  t.is(records.length, 1);
  t.deepEqual(activity, ['profile-1', 'profile-2']);

  await consumer.consume(
    [
      {
        type: 'usage',
        route: { ...route, source: 'local', profileId: 'local-1' },
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          cached_tokens: 0,
        },
      },
      {
        type: 'route_selected',
        route: { ...route, source: 'local', profileId: 'local-1' },
      },
      {
        type: 'route_selected',
        route: { ...route, source: 'affine_cloud', profileId: 'managed-1' },
      },
      { type: 'route_failed', route, errorKind: 'upstream_error' },
    ],
    { workspaceId: 'workspace-1', featureKind: 'chat' }
  );
  t.like(records[1], {
    providerSource: 'byok_local',
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
  });
  t.deepEqual(activity, ['profile-1', 'profile-2']);
  t.deepEqual(failures, ['upstream_error']);
});

test('tool callback validates arguments and preserves call identity', async t => {
  const result = await executeToolCall(
    {
      echo: {
        description: 'echo',
        inputSchema: z.object({ value: z.string() }),
        execute: async ({ value }) => ({ value }),
      },
    },
    { callId: 'call-1', name: 'echo', args: { value: 'ok' } },
    {}
  );
  t.deepEqual(result, {
    callId: 'call-1',
    name: 'echo',
    args: { value: 'ok' },
    rawArgumentsText: undefined,
    argumentParseError: undefined,
    output: { value: 'ok' },
  });
});

test('tool callback reports missing tools and invalid argument JSON', async t => {
  const missing = await executeToolCall(
    {},
    { callId: 'call-1', name: 'missing', args: {} },
    {}
  );
  const invalid = await executeToolCall(
    {},
    {
      callId: 'call-2',
      name: 'missing',
      args: {},
      rawArgumentsText: '{',
      argumentParseError: 'unexpected end',
    },
    {}
  );
  t.true(missing.isError);
  t.true(invalid.isError);
  t.deepEqual(invalid.output, {
    message: 'Invalid tool arguments JSON',
    rawArguments: '{',
    error: 'unexpected end',
  });
});

test('tool callback rejects invalid zod args without execution', async t => {
  let executed = false;
  const result = await executeToolCall(
    {
      echo: {
        description: 'echo',
        inputSchema: z.object({ value: z.string().trim() }),
        execute: async () => {
          executed = true;
        },
      },
    },
    {
      callId: 'call-1',
      name: 'echo',
      args: { value: 42 },
      rawArgumentsText: '{"value":42}',
    },
    {}
  );

  t.true(result.isError);
  t.false(executed);
});

test('tool callback passes transformed args without prototype pollution', async t => {
  const received: unknown[] = [];
  const result = await executeToolCall(
    {
      echo: {
        description: 'echo',
        inputSchema: z.object({ value: z.string().trim() }).passthrough(),
        execute: async args => received.push(args),
      },
    },
    {
      callId: 'call-1',
      name: 'echo',
      args: JSON.parse('{"value":" AFFiNE ","__proto__":{"polluted":true}}'),
    },
    {}
  );

  t.false(result.isError ?? false);
  t.deepEqual(received, [{ value: 'AFFiNE' }]);
  t.is((Object.prototype as Record<string, unknown>).polluted, undefined);
});
