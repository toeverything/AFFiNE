import {
  createPerplexity,
  type PerplexityProvider as VercelPerplexityProvider,
} from '@ai-sdk/perplexity';
import { generateText, streamText } from 'ai';
import { z } from 'zod';

import {
  CopilotPromptInvalid,
  CopilotProviderSideError,
  metrics,
} from '../../../base';
import { CopilotProvider } from './provider';
import {
  CopilotCapability,
  CopilotChatOptions,
  CopilotProviderType,
  CopilotTextToTextProvider,
  PromptMessage,
} from './types';
import { chatToGPTMessage, CitationParser } from './utils';

export type PerplexityConfig = {
  apiKey: string;
  endpoint?: string;
};

const PerplexityErrorSchema = z.union([
  z.object({
    detail: z.array(
      z.object({
        loc: z.array(z.string()),
        msg: z.string(),
        type: z.string(),
      })
    ),
  }),
  z.object({
    error: z.object({
      message: z.string(),
      type: z.string(),
      code: z.number(),
    }),
  }),
]);

type PerplexityError = z.infer<typeof PerplexityErrorSchema>;

export class PerplexityProvider
  extends CopilotProvider<PerplexityConfig>
  implements CopilotTextToTextProvider
{
  readonly type = CopilotProviderType.Perplexity;
  readonly capabilities = [CopilotCapability.TextToText];
  readonly models = [
    'sonar',
    'sonar-pro',
    'sonar-reasoning',
    'sonar-reasoning-pro',
  ];

  #instance!: VercelPerplexityProvider;

  override configured(): boolean {
    return !!this.config.apiKey;
  }

  protected override setup() {
    super.setup();
    this.#instance = createPerplexity({
      apiKey: this.config.apiKey,
      baseURL: this.config.endpoint,
    });
  }

  async generateText(
    messages: PromptMessage[],
    model: string = 'sonar',
    options: CopilotChatOptions = {}
  ): Promise<string> {
    await this.checkParams({ messages, model, options });
    try {
      metrics.ai.counter('chat_text_calls').add(1, { model });

      const [system, msgs] = await chatToGPTMessage(messages);

      const modelInstance = this.#instance(model);

      const { text, sources } = await generateText({
        model: modelInstance,
        system,
        messages: msgs,
        temperature: options.temperature || 0,
        maxTokens: options.maxTokens || 4096,
        abortSignal: options.signal,
      });

      const citationParser = new CitationParser();
      const citations = sources.map(s => s.url);
      let result = text.replaceAll(/<\/?think>\n/g, '\n---\n');
      result = citationParser.parse(result, citations);
      result += citationParser.end();
      return result;
    } catch (e: any) {
      metrics.ai.counter('chat_text_errors').add(1, { model });
      throw this.handleError(e);
    }
  }

  async *generateTextStream(
    messages: PromptMessage[],
    model: string = 'sonar',
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    await this.checkParams({ messages, model, options });
    try {
      metrics.ai.counter('chat_text_stream_calls').add(1, { model });

      const [system, msgs] = await chatToGPTMessage(messages);

      const modelInstance = this.#instance(model);

      const stream = streamText({
        model: modelInstance,
        system,
        messages: msgs,
        temperature: options.temperature || 0,
        maxTokens: options.maxTokens || 4096,
        abortSignal: options.signal,
      });

      const citationParser = new CitationParser();
      const citations = [];
      for await (const chunk of stream.fullStream) {
        switch (chunk.type) {
          case 'source': {
            citations.push(chunk.source.url);
            break;
          }
          case 'text-delta': {
            const result = citationParser.parse(
              chunk.textDelta.replaceAll(/<\/?think>\n?/g, '\n---\n'),
              citations
            );
            yield result;
            break;
          }
          case 'step-finish': {
            const result = citationParser.end();
            yield result;
            break;
          }
          case 'error': {
            const json =
              typeof chunk.error === 'string'
                ? JSON.parse(chunk.error)
                : chunk.error;
            if (json && typeof json === 'object') {
              const data = PerplexityErrorSchema.parse(json);
              if ('detail' in data || 'error' in data) {
                throw this.convertError(data);
              }
            }
          }
        }
      }
    } catch (e) {
      metrics.ai.counter('chat_text_stream_errors').add(1, { model });
      throw e;
    }
  }

  protected async checkParams({
    model,
  }: {
    messages?: PromptMessage[];
    embeddings?: string[];
    model: string;
    options: CopilotChatOptions;
  }) {
    if (!(await this.isModelAvailable(model))) {
      throw new CopilotPromptInvalid(`Invalid model: ${model}`);
    }
  }

  private convertError(e: PerplexityError) {
    function getErrMessage(e: PerplexityError) {
      let err = 'Unexpected perplexity response';
      if ('detail' in e) {
        err = e.detail[0].msg || err;
      } else if ('error' in e) {
        err = e.error.message || err;
      }
      return err;
    }

    throw new CopilotProviderSideError({
      provider: this.type,
      kind: 'unexpected_response',
      message: getErrMessage(e),
    });
  }

  private handleError(e: any) {
    if (e instanceof CopilotProviderSideError) {
      return e;
    }
    return new CopilotProviderSideError({
      provider: this.type,
      kind: 'unexpected_response',
      message: e?.message || 'Unexpected perplexity response',
    });
  }
}
