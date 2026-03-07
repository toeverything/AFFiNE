import test from 'ava';

import { ProviderMiddlewareConfig } from '../../plugins/copilot/config';
import { normalizeOpenAIOptionsForModel } from '../../plugins/copilot/providers/openai';
import { CopilotProvider } from '../../plugins/copilot/providers/provider';
import {
  CopilotProviderType,
  ModelInputType,
  ModelOutputType,
} from '../../plugins/copilot/providers/types';

class TestOpenAIProvider extends CopilotProvider<{ apiKey: string }> {
  readonly type = CopilotProviderType.OpenAI;
  readonly models = [
    {
      id: 'gpt-5-mini',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Text],
          defaultForOutputType: true,
        },
      ],
    },
  ];

  configured() {
    return true;
  }

  async text(_cond: any, _messages: any[], _options?: any) {
    return '';
  }

  async *streamText(_cond: any, _messages: any[], _options?: any) {
    yield '';
  }

  exposeMetricLabels() {
    return this.metricLabels('gpt-5-mini');
  }

  exposeMiddleware() {
    return this.getActiveProviderMiddleware();
  }
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

test('metricLabels should include active provider id', t => {
  const provider = createProvider();
  const labels = provider.runWithProfile('openai-main', () =>
    provider.exposeMetricLabels()
  );
  t.is(labels.providerId, 'openai-main');
});

test('getActiveProviderMiddleware should merge defaults with profile override', t => {
  const provider = createProvider({
    rust: { request: ['clamp_max_tokens'] },
    node: { text: ['thinking_format'] },
  });

  const middleware = provider.runWithProfile('openai-main', () =>
    provider.exposeMiddleware()
  );

  t.deepEqual(middleware.rust?.request, [
    'normalize_messages',
    'clamp_max_tokens',
  ]);
  t.deepEqual(middleware.rust?.stream, [
    'stream_event_normalize',
    'citation_indexing',
  ]);
  t.deepEqual(middleware.node?.text, [
    'citation_footnote',
    'callout',
    'thinking_format',
  ]);
});

test('normalizeOpenAIOptionsForModel should drop sampling knobs for gpt-5.2', t => {
  t.deepEqual(
    normalizeOpenAIOptionsForModel(
      {
        temperature: 0.7,
        topP: 0.8,
        presencePenalty: 0.2,
        frequencyPenalty: 0.1,
        maxTokens: 128,
      },
      'gpt-5.4'
    ),
    { maxTokens: 128 }
  );
});

test('normalizeOpenAIOptionsForModel should keep options for gpt-5-mini', t => {
  t.deepEqual(
    normalizeOpenAIOptionsForModel(
      {
        temperature: 0.7,
        maxTokens: 128,
      },
      'gpt-5-mini'
    ),
    {
      temperature: 0.7,
      maxTokens: 128,
    }
  );
});
