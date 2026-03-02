import test from 'ava';

import { resolveProviderMiddleware } from '../../plugins/copilot/providers/provider-middleware';
import { buildProviderRegistry } from '../../plugins/copilot/providers/provider-registry';
import { CopilotProviderType } from '../../plugins/copilot/providers/types';

test('resolveProviderMiddleware should include anthropic defaults', t => {
  const middleware = resolveProviderMiddleware(CopilotProviderType.Anthropic);

  t.deepEqual(middleware.rust?.request, [
    'normalize_messages',
    'tool_schema_rewrite',
  ]);
  t.deepEqual(middleware.rust?.stream, [
    'stream_event_normalize',
    'citation_indexing',
  ]);
  t.deepEqual(middleware.node?.text, ['citation_footnote', 'callout']);
});

test('resolveProviderMiddleware should merge defaults and overrides', t => {
  const middleware = resolveProviderMiddleware(CopilotProviderType.OpenAI, {
    rust: { request: ['clamp_max_tokens'] },
    node: { text: ['thinking_format'] },
  });

  t.deepEqual(middleware.rust?.request, [
    'normalize_messages',
    'clamp_max_tokens',
  ]);
  t.deepEqual(middleware.node?.text, [
    'citation_footnote',
    'callout',
    'thinking_format',
  ]);
});

test('buildProviderRegistry should normalize profile middleware defaults', t => {
  const registry = buildProviderRegistry({
    profiles: [
      {
        id: 'openai-main',
        type: CopilotProviderType.OpenAI,
        config: { apiKey: '1' },
      },
    ],
  });

  const profile = registry.profiles.get('openai-main');
  t.truthy(profile);
  t.deepEqual(profile?.middleware.rust?.stream, [
    'stream_event_normalize',
    'citation_indexing',
  ]);
  t.deepEqual(profile?.middleware.node?.text, ['citation_footnote', 'callout']);
});
