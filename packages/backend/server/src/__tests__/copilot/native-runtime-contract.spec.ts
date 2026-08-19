import { access } from 'node:fs/promises';
import path from 'node:path';

import ava from 'ava';

import {
  buildLlmEmbeddingRequest,
  buildLlmImageRequestFromMessages,
  buildLlmRerankRequest,
  llmBuildCanonicalRequest,
  llmBuildCanonicalStructuredRequest,
  llmGetBuiltInRouteOptions,
} from '../../native';
import { ChatQuerySchema } from '../../plugins/copilot/types';

const test = ava;

test('canonical request builders cover every execution request kind', t => {
  const chat = llmBuildCanonicalRequest({
    model: 'route-selected',
    messages: [{ role: 'user', content: 'hello' }],
  });
  const structured = llmBuildCanonicalStructuredRequest({
    model: 'route-selected',
    messages: [{ role: 'user', content: 'hello' }],
    schema: { type: 'object' },
  });
  const embedding = buildLlmEmbeddingRequest({
    model: 'route-selected',
    inputs: ['hello'],
    dimensions: 4,
  });
  const rerank = buildLlmRerankRequest('route-selected', {
    query: 'hello',
    candidates: [{ id: 'one', text: 'world' }],
  });
  const image = buildLlmImageRequestFromMessages({
    model: 'route-selected',
    messages: [{ role: 'user', content: 'draw a circle' }],
  });

  t.is(chat.model, 'route-selected');
  t.deepEqual(structured.schema, { type: 'object' });
  t.is(embedding.dimensions, 4);
  t.is(rerank.candidates[0].id, 'one');
  t.is(image.prompt, 'draw a circle');
});

test('image requests stay provider neutral before target selection', t => {
  const image = buildLlmImageRequestFromMessages({
    model: 'opaque/model:id',
    messages: [
      {
        role: 'user',
        content: 'restyle',
        attachments: [
          {
            kind: 'url',
            url: 'data:image/png;base64,aW1n',
            mimeType: 'image/png',
          },
        ],
      },
    ],
  });
  t.is(image.model, 'opaque/model:id');
  t.is(image.images?.[0].kind, 'data');
});

test('target override is all-or-nothing and preserves opaque model ids', t => {
  const parsed = ChatQuerySchema.parse({
    profileId: 'profile-1',
    modelId: 'vendor/model:B',
  });
  t.is(parsed.profileId, 'profile-1');
  t.is(parsed.modelId, 'vendor/model:B');
  t.throws(() => ChatQuerySchema.parse({ profileId: 'profile-1' }));
  t.throws(() => ChatQuerySchema.parse({ modelId: 'vendor/model:B' }));
  t.is(
    ChatQuerySchema.parse({ routeTargetId: 'terra' }).routeTargetId,
    'terra'
  );

  const route = llmGetBuiltInRouteOptions('Chat With AFFiNE AI');
  t.is(route?.standardDefaultTargetId, 'luna');
  t.is(route?.premiumDefaultTargetId, 'luna');
  t.deepEqual(
    route?.choices.map(choice => [choice.id, choice.minimumTier]),
    [
      ['luna', 'Standard'],
      ['terra', 'Premium'],
      ['gemini', 'Premium'],
      ['claude', 'Premium'],
    ]
  );
});

test('caller supplied route policy facts are rejected', t => {
  for (const field of ['requirements', 'deployment', 'profiles', 'presets']) {
    t.throws(() => ChatQuerySchema.parse({ [field]: 'caller-value' }));
  }
});

test('Node provider registry and factory are absent', async t => {
  const directory = path.join(
    process.cwd(),
    'packages/backend/server/src/plugins/copilot/providers'
  );
  for (const file of [
    'factory.ts',
    'provider-registry.ts',
    'registry-service.ts',
  ]) {
    await t.throwsAsync(access(path.join(directory, file)));
  }
});
