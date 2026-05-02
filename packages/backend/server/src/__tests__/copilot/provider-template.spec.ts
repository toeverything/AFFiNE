import serverNativeModule from '@affine/server-native';
import test from 'ava';
import { z } from 'zod';

import type {
  LlmEmbeddingRequest,
  LlmRerankRequest,
  LlmStructuredRequest,
} from '../../native';
import { CopilotProvider } from '../../plugins/copilot/providers/provider';
import type { ProviderDriverSpec } from '../../plugins/copilot/providers/provider-runtime-contract';
import { CopilotProviderType } from '../../plugins/copilot/providers/types';
import {
  buildStructuredResponseContract,
  type RequiredStructuredOutputContract,
  requireStructuredOutputContract,
} from '../../plugins/copilot/runtime/contracts';
import { getProviderRuntimeHost } from '../../plugins/copilot/runtime/provider-runtime-context';
import { nativeUserText, singleUserPromptMessages } from './prompt-test-helper';

function structuredOptions(schema: z.ZodTypeAny) {
  const { responseSchemaJson, schemaHash } =
    buildStructuredResponseContract(schema);
  return { responseSchemaJson, schemaHash };
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

class TemplateOnlyProvider extends CopilotProvider<{ apiKey: string }> {
  readonly type = CopilotProviderType.OpenAI;
  protected resolveModelBackendKind() {
    return 'openai_responses' as const;
  }

  readonly structuredRequests: LlmStructuredRequest[] = [];
  readonly embeddingRequests: LlmEmbeddingRequest[] = [];
  readonly rerankRequests: Array<{
    model: string;
    query: string;
    candidates: Array<{ id?: string; text: string }>;
    topN?: number;
  }> = [];

  configured() {
    return true;
  }

  override getDriverSpec(): ProviderDriverSpec {
    return {
      createBackendConfig: () => ({
        base_url: 'https://api.openai.com',
        auth_token: 'test-key',
      }),
      mapError: (error: unknown) => error,
      structured: {},
      embedding: {
        defaultDimensions: 8,
      },
      rerank: {},
    };
  }
}

test('template-only provider should reuse base structured, embedding and rerank drivers', async t => {
  const provider = new TemplateOnlyProvider();
  const originalStructured = (serverNativeModule as any).llmStructuredDispatch;
  const originalEmbedding = (serverNativeModule as any).llmEmbeddingDispatch;
  const originalRerank = (serverNativeModule as any).llmRerankDispatch;

  (serverNativeModule as any).llmStructuredDispatch = (
    _protocol: string,
    _backendConfigJson: string,
    requestJson: string
  ) => {
    provider.structuredRequests.push(
      JSON.parse(requestJson) as LlmStructuredRequest
    );
    return JSON.stringify({
      id: 'structured_1',
      model: 'gpt-5-mini',
      output_text: '{"summary":"native"}',
      output_json: { summary: 'native' },
      usage: {
        prompt_tokens: 3,
        completion_tokens: 2,
        total_tokens: 5,
      },
      finish_reason: 'stop',
    });
  };
  (serverNativeModule as any).llmEmbeddingDispatch = (
    _protocol: string,
    _backendConfigJson: string,
    requestJson: string
  ) => {
    const request = JSON.parse(requestJson) as LlmEmbeddingRequest;
    provider.embeddingRequests.push(request);
    return JSON.stringify({
      model: request.model,
      embeddings: request.inputs.map((_, index) => [index + 0.1, index + 0.2]),
    });
  };
  (serverNativeModule as any).llmRerankDispatch = (
    _protocol: string,
    _backendConfigJson: string,
    requestJson: string
  ) => {
    const request = JSON.parse(requestJson) as LlmRerankRequest;
    provider.rerankRequests.push(request);
    return JSON.stringify({
      model: request.model,
      scores: request.candidates.map((_candidate, index) =>
        index === 0 ? 0.9 : 0.1
      ),
    });
  };
  t.teardown(() => {
    (serverNativeModule as any).llmStructuredDispatch = originalStructured;
    (serverNativeModule as any).llmEmbeddingDispatch = originalEmbedding;
    (serverNativeModule as any).llmRerankDispatch = originalRerank;
  });

  const structured = await getProviderRuntimeHost(provider).run.structured(
    { modelId: 'gpt-5-mini' },
    singleUserPromptMessages('summarize this'),
    structuredOptions(z.object({ summary: z.string() })),
    structuredContract(z.object({ summary: z.string() }))
  );
  const embeddings = await getProviderRuntimeHost(provider).run.embedding(
    { modelId: 'text-embedding-3-small' },
    ['alpha', 'beta'],
    {
      dimensions: 8,
    }
  );
  const scores = await getProviderRuntimeHost(provider).run.rerank(
    { modelId: 'gpt-4o-mini' },
    {
      query: 'alpha',
      candidates: [
        { id: 'alpha', text: 'alpha result' },
        { id: 'beta', text: 'beta result' },
      ],
      topK: 1,
    }
  );

  t.is(structured, JSON.stringify({ summary: 'native' }));
  t.deepEqual(embeddings, [
    [0.1, 0.2],
    [1.1, 1.2],
  ]);
  t.deepEqual(scores, [0.9, 0.1]);
  t.is(provider.structuredRequests.length, 1);
  t.like(provider.structuredRequests[0], {
    model: 'gpt-5-mini',
    messages: [
      { role: 'user', content: nativeUserText('summarize this').content },
    ],
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
      },
      required: ['summary'],
      additionalProperties: false,
    },
    strict: true,
    responseMimeType: 'application/json',
  });
  t.is(provider.structuredRequests[0]?.middleware, undefined);
  t.deepEqual(provider.embeddingRequests, [
    {
      model: 'text-embedding-3-small',
      inputs: ['alpha', 'beta'],
      dimensions: 8,
      taskType: 'RETRIEVAL_DOCUMENT',
    },
  ]);
  t.deepEqual(provider.rerankRequests, [
    {
      model: 'gpt-4o-mini',
      query: 'alpha',
      candidates: [
        { id: 'alpha', text: 'alpha result' },
        { id: 'beta', text: 'beta result' },
      ],
      topN: 1,
    },
  ]);
});
