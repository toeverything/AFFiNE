import test from 'ava';

import {
  buildProviderRegistry,
  resolveModel,
  stripProviderPrefix,
} from '../../plugins/copilot/providers/provider-registry';
import {
  CopilotProviderType,
  ModelOutputType,
} from '../../plugins/copilot/providers/types';

test('buildProviderRegistry should keep explicit profile over legacy compatibility profile', t => {
  const registry = buildProviderRegistry({
    profiles: [
      {
        id: 'openai-default',
        type: CopilotProviderType.OpenAI,
        priority: 100,
        config: { apiKey: 'new' },
      },
    ],
    openai: { apiKey: 'legacy' },
  });

  const profile = registry.profiles.get('openai-default');
  t.truthy(profile);
  t.deepEqual(profile?.config, { apiKey: 'new' });
});

test('buildProviderRegistry should reject duplicated profile ids', t => {
  const error = t.throws(() =>
    buildProviderRegistry({
      profiles: [
        {
          id: 'openai-main',
          type: CopilotProviderType.OpenAI,
          config: { apiKey: '1' },
        },
        {
          id: 'openai-main',
          type: CopilotProviderType.OpenAI,
          config: { apiKey: '2' },
        },
      ],
    })
  ) as Error;

  t.truthy(error);
  t.regex(error.message, /Duplicated copilot provider profile id/);
});

test('buildProviderRegistry should reject defaults that reference unknown providers', t => {
  const error = t.throws(() =>
    buildProviderRegistry({
      profiles: [
        {
          id: 'openai-main',
          type: CopilotProviderType.OpenAI,
          config: { apiKey: '1' },
        },
      ],
      defaults: {
        fallback: 'unknown-provider',
      },
    })
  ) as Error;

  t.truthy(error);
  t.regex(error.message, /defaults references unknown providerId/);
});

test('resolveModel should support explicit provider prefix and keep slash models untouched', t => {
  const registry = buildProviderRegistry({
    profiles: [
      {
        id: 'openai-main',
        type: CopilotProviderType.OpenAI,
        config: { apiKey: '1' },
      },
      {
        id: 'fal-main',
        type: CopilotProviderType.FAL,
        config: { apiKey: '2' },
      },
    ],
  });

  const prefixed = resolveModel({
    registry,
    modelId: 'openai-main/gpt-4.1',
  });
  t.deepEqual(prefixed, {
    rawModelId: 'openai-main/gpt-4.1',
    modelId: 'gpt-4.1',
    explicitProviderId: 'openai-main',
    candidateProviderIds: ['openai-main'],
  });

  const slashModel = resolveModel({
    registry,
    modelId: 'lora/image-to-image',
  });
  t.is(slashModel.modelId, 'lora/image-to-image');
  t.false(slashModel.candidateProviderIds.includes('lora'));
});

test('resolveModel should follow defaults -> fallback -> order and apply filters', t => {
  const registry = buildProviderRegistry({
    profiles: [
      {
        id: 'openai-main',
        type: CopilotProviderType.OpenAI,
        priority: 10,
        config: { apiKey: '1' },
      },
      {
        id: 'anthropic-main',
        type: CopilotProviderType.Anthropic,
        priority: 5,
        config: { apiKey: '2' },
      },
      {
        id: 'fal-main',
        type: CopilotProviderType.FAL,
        priority: 1,
        config: { apiKey: '3' },
      },
    ],
    defaults: {
      [ModelOutputType.Text]: 'anthropic-main',
      fallback: 'openai-main',
    },
  });

  const routed = resolveModel({
    registry,
    outputType: ModelOutputType.Text,
    preferredProviderIds: ['openai-main', 'fal-main'],
  });

  t.deepEqual(routed.candidateProviderIds, ['openai-main', 'fal-main']);
});

test('stripProviderPrefix should only strip matched provider prefix', t => {
  const registry = buildProviderRegistry({
    profiles: [
      {
        id: 'openai-main',
        type: CopilotProviderType.OpenAI,
        config: { apiKey: '1' },
      },
    ],
  });

  t.is(
    stripProviderPrefix(registry, 'openai-main', 'openai-main/gpt-4.1'),
    'gpt-4.1'
  );
  t.is(
    stripProviderPrefix(registry, 'openai-main', 'another-main/gpt-4.1'),
    'another-main/gpt-4.1'
  );
  t.is(stripProviderPrefix(registry, 'openai-main', 'gpt-4.1'), 'gpt-4.1');
});
