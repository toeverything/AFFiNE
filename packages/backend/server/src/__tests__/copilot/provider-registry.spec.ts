import test from 'ava';

import {
  buildProviderRegistry,
  migrateProvidersConfig,
  resolveModel,
  stripProviderPrefix,
} from '../../plugins/copilot/providers/provider-registry';
import {
  CopilotProviderType,
  ModelInputType,
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

test('migrateProvidersConfig should migrate unversioned config with string models to v2', t => {
  const migrated = migrateProvidersConfig({
    profiles: [
      {
        id: 'openai-main',
        type: CopilotProviderType.OpenAI,
        config: { apiKey: '1' },
        models: ['gpt-4o', 'gpt-4.1'] as any,
      },
    ],
  });

  t.is(migrated.version, 2);
  const models = migrated.profiles?.[0].models;
  t.is(models?.length, 2);
  t.deepEqual(models?.[0], { id: 'gpt-4o', capabilities: [] });
  t.deepEqual(models?.[1], { id: 'gpt-4.1', capabilities: [] });
});

test('migrateProvidersConfig should migrate mixed string and object models to v2', t => {
  const migrated = migrateProvidersConfig({
    profiles: [
      {
        id: 'litellm',
        type: CopilotProviderType.OpenAI,
        config: { apiKey: 'sk-key' },
        models: [
          'openai/gpt-4o',
          {
            id: 'anthropic/claude-sonnet-4',
            capabilities: [
              {
                input: [ModelInputType.Text],
                output: [ModelOutputType.Text],
              },
            ],
          },
        ] as any,
      },
    ],
  });

  t.is(migrated.version, 2);
  const models = migrated.profiles?.[0].models;
  t.is(models?.length, 2);
  t.deepEqual(models?.[0], { id: 'openai/gpt-4o', capabilities: [] });
  t.is(models?.[1].id, 'anthropic/claude-sonnet-4');
  t.truthy(models?.[1].capabilities.length);
});

test('migrateProvidersConfig should pass through v2 config unchanged', t => {
  const v2Config = {
    version: 2 as const,
    profiles: [
      {
        id: 'litellm',
        type: CopilotProviderType.OpenAI as const,
        config: { apiKey: 'sk-key' },
        models: [
          {
            id: 'anthropic/claude-sonnet-4',
            capabilities: [
              {
                input: [ModelInputType.Text, ModelInputType.Image],
                output: [ModelOutputType.Text, ModelOutputType.Object],
              },
            ],
          },
        ],
      },
    ],
  };

  const migrated = migrateProvidersConfig(v2Config);
  t.is(migrated, v2Config);
});

test('buildProviderRegistry should migrate v1 string models to modelFilter and modelDeclarations', t => {
  const registry = buildProviderRegistry({
    profiles: [
      {
        id: 'openai-main',
        type: CopilotProviderType.OpenAI,
        config: { apiKey: '1' },
        models: ['gpt-4o', 'gpt-4.1'] as any,
      },
    ],
  });

  const profile = registry.profiles.get('openai-main');
  t.truthy(profile);
  t.deepEqual(profile?.modelFilter, ['gpt-4o', 'gpt-4.1']);
  t.is(profile?.modelDeclarations.length, 2);
  t.deepEqual(profile?.modelDeclarations[0].capabilities, []);
  t.deepEqual(profile?.modelDeclarations[1].capabilities, []);
});

test('buildProviderRegistry should normalise v2 model declarations to both modelFilter and modelDeclarations', t => {
  const registry = buildProviderRegistry({
    version: 2,
    profiles: [
      {
        id: 'litellm',
        type: CopilotProviderType.OpenAI as const,
        config: {
          apiKey: 'sk-key',
          baseURL: 'https://litellm.example.com/v1',
        },
        models: [
          {
            id: 'anthropic/claude-sonnet-4',
            name: 'Claude Sonnet 4',
            capabilities: [
              {
                input: [ModelInputType.Text, ModelInputType.Image],
                output: [ModelOutputType.Text, ModelOutputType.Object],
              },
            ],
          },
        ],
      },
    ],
  });

  const profile = registry.profiles.get('litellm');
  t.truthy(profile);
  t.deepEqual(profile?.modelFilter, ['anthropic/claude-sonnet-4']);
  t.is(profile?.modelDeclarations.length, 1);
  t.is(profile?.modelDeclarations[0].id, 'anthropic/claude-sonnet-4');
  t.is(profile?.modelDeclarations[0].name, 'Claude Sonnet 4');
  t.truthy(profile?.modelDeclarations[0].capabilities.length);
});

test('buildProviderRegistry should preserve defaultForOutputType in model declarations', t => {
  const registry = buildProviderRegistry({
    version: 2,
    profiles: [
      {
        id: 'litellm',
        type: CopilotProviderType.OpenAI as const,
        config: { apiKey: 'sk-key' },
        models: [
          {
            id: 'nomic-embed-text',
            name: 'Nomic Embed',
            capabilities: [
              {
                input: [ModelInputType.Text],
                output: [ModelOutputType.Embedding],
                defaultForOutputType: true,
              },
            ],
          },
        ],
      },
    ],
  });

  const profile = registry.profiles.get('litellm');
  t.truthy(profile);
  t.is(
    profile?.modelDeclarations[0].capabilities[0].defaultForOutputType,
    true
  );
});

test('resolveModel should not treat litellm model slash as provider prefix', t => {
  const registry = buildProviderRegistry({
    profiles: [
      {
        id: 'litellm',
        type: CopilotProviderType.OpenAI,
        config: { apiKey: 'sk-key' },
      },
    ],
  });

  // 'anthropic/claude-sonnet-4' should NOT be parsed as provider prefix
  // because 'anthropic' is not a profile id
  const result = resolveModel({
    registry,
    modelId: 'anthropic/claude-sonnet-4',
  });
  t.is(result.modelId, 'anthropic/claude-sonnet-4');
  t.is(result.explicitProviderId, undefined);
});
