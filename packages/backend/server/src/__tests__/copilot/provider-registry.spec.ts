import test from 'ava';

import { OpenAIProvider } from '../../plugins/copilot/providers';
import { CopilotProviderLifecycleService } from '../../plugins/copilot/providers/lifecycle-service';
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
    modelId: 'openai-main/gpt-5-mini',
  });
  t.deepEqual(prefixed, {
    rawModelId: 'openai-main/gpt-5-mini',
    modelId: 'gpt-5-mini',
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

test('resolveModel should resolve bare model ids by provider priority order', t => {
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
      fallback: 'fal-main',
    },
  });

  const routed = resolveModel({
    registry,
    modelId: 'shared-model',
  });

  t.deepEqual(routed.candidateProviderIds, [
    'openai-main',
    'anthropic-main',
    'fal-main',
  ]);
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
    stripProviderPrefix(registry, 'openai-main', 'openai-main/gpt-5-mini'),
    'gpt-5-mini'
  );
  t.is(
    stripProviderPrefix(registry, 'openai-main', 'another-main/gpt-5-mini'),
    'another-main/gpt-5-mini'
  );
  t.is(
    stripProviderPrefix(registry, 'openai-main', 'gpt-5-mini'),
    'gpt-5-mini'
  );
});

test('CopilotProviderLifecycleService should register current profiles and unregister stale ones', async t => {
  const calls: string[] = [];
  let registry = buildProviderRegistry({
    profiles: [
      {
        id: 'openai-main',
        type: CopilotProviderType.OpenAI,
        config: { apiKey: '1' },
      },
      {
        id: 'openai-backup',
        type: CopilotProviderType.OpenAI,
        config: { apiKey: '2' },
      },
    ],
  });

  const provider = {
    type: CopilotProviderType.OpenAI,
    configured(execution: { providerId?: string } | undefined) {
      return execution?.providerId === 'openai-main';
    },
  };
  const service = new CopilotProviderLifecycleService(
    {
      get(token: unknown) {
        return token === OpenAIProvider ? provider : undefined;
      },
    } as any,
    {
      register(providerId: string) {
        calls.push(`register:${providerId}`);
      },
      unregister(providerId: string) {
        calls.push(`unregister:${providerId}`);
      },
    } as any,
    {
      getRegistry() {
        return registry;
      },
    } as any
  );

  await service.syncProviders();

  t.deepEqual(calls.slice().sort(), [
    'register:openai-main',
    'unregister:openai-backup',
  ]);

  calls.length = 0;
  registry = buildProviderRegistry({
    profiles: [
      {
        id: 'openai-backup',
        type: CopilotProviderType.OpenAI,
        config: { apiKey: '2' },
      },
    ],
  });
  provider.configured = (execution: { providerId?: string } | undefined) =>
    execution?.providerId === 'openai-backup';

  await service.syncProviders();

  t.deepEqual(calls.slice().sort(), [
    'register:openai-backup',
    'unregister:openai-main',
  ]);
});
