import serverNativeModule from '@affine/server-native';
import test from 'ava';

import type { NativeLlmRerankRequest } from '../../native';
import { ProviderMiddlewareConfig } from '../../plugins/copilot/config';
import {
  normalizeOpenAIOptionsForModel,
  OpenAIProvider,
} from '../../plugins/copilot/providers/openai';
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

class NativeRerankProtocolProvider extends OpenAIProvider {
  override readonly models = [
    {
      id: 'gpt-5.2',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Text, ModelOutputType.Rerank],
          defaultForOutputType: true,
        },
      ],
    },
  ];

  override get config() {
    return {
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com/v1',
      oldApiStyle: false,
    };
  }

  override configured() {
    return true;
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

test('normalizeOpenAIOptionsForModel should keep options for gpt-4.1', t => {
  t.deepEqual(
    normalizeOpenAIOptionsForModel(
      { temperature: 0.7, topP: 0.8, maxTokens: 128 },
      'gpt-4.1'
    ),
    { temperature: 0.7, topP: 0.8, maxTokens: 128 }
  );
});

test('OpenAI rerank should always use chat-completions native protocol', async t => {
  const provider = new NativeRerankProtocolProvider();
  let capturedProtocol: string | undefined;
  let capturedRequest: NativeLlmRerankRequest | undefined;

  const original = (serverNativeModule as any).llmRerankDispatch;
  (serverNativeModule as any).llmRerankDispatch = (
    protocol: string,
    _backendConfigJson: string,
    requestJson: string
  ) => {
    capturedProtocol = protocol;
    capturedRequest = JSON.parse(requestJson) as NativeLlmRerankRequest;
    return JSON.stringify({ model: 'gpt-5.2', scores: [0.9, 0.1] });
  };
  t.teardown(() => {
    (serverNativeModule as any).llmRerankDispatch = original;
  });

  const scores = await provider.rerank(
    { modelId: 'gpt-5.2' },
    {
      query: 'programming',
      candidates: [
        { id: 'react', text: 'React is a UI library.' },
        { id: 'weather', text: 'The weather is sunny today.' },
      ],
    }
  );

  t.deepEqual(scores, [0.9, 0.1]);
  t.is(capturedProtocol, 'openai_chat');
  t.deepEqual(capturedRequest, {
    model: 'gpt-5.2',
    query: 'programming',
    candidates: [
      { id: 'react', text: 'React is a UI library.' },
      { id: 'weather', text: 'The weather is sunny today.' },
    ],
  });
});
