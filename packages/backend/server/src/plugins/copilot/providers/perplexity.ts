import {
  createPerplexity,
  type PerplexityProvider as VercelPerplexityProvider,
} from '@ai-sdk/perplexity';
import { generateText, streamText } from 'ai';
import { z } from 'zod';

import { CopilotProviderSideError, metrics } from '../../../base';
import { CopilotProvider } from './provider';
import {
  CopilotChatOptions,
  CopilotProviderType,
  ModelConditions,
  ModelInputType,
  ModelOutputType,
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

export class PerplexityProvider extends CopilotProvider<PerplexityConfig> {
  readonly type = CopilotProviderType.Perplexity;

  readonly models = [
    {
      name: 'Sonar',
      id: 'sonar',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Text],
          defaultForOutputType: true,
        },
      ],
    },
    {
      name: 'Sonar Pro',
      id: 'sonar-pro',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Text],
        },
      ],
    },
    {
      name: 'Sonar Reasoning',
      id: 'sonar-reasoning',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Text],
        },
      ],
    },
    {
      name: 'Sonar Reasoning Pro',
      id: 'sonar-reasoning-pro',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Text],
        },
      ],
    },
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

  async text(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): Promise<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Text };
    await this.checkParams({ cond: fullCond, messages, options });
    const model = this.selectModel(fullCond);

    try {
      metrics.ai.counter('chat_text_calls').add(1, { model: model.id });

      const [system, msgs] = await chatToGPTMessage(messages, false);

      const modelInstance = this.#instance(model.id);

      const { text, sources } = await generateText({
        model: modelInstance,
        system,
        messages: msgs,
        temperature: options.temperature ?? 0,
        maxOutputTokens: options.maxTokens ?? 4096,
        abortSignal: options.signal,
      });

      const parser = new CitationParser();
      for (const source of sources.filter(s => s.sourceType === 'url')) {
        parser.push(source.url);
      }

      let result = text.replaceAll(/<\/?think>\n/g, '\n---\n');
      result = parser.parse(result);
      result += parser.end();
      return result;
    } catch (e: any) {
      metrics.ai.counter('chat_text_errors').add(1, { model: model.id });
      throw this.handleError(e);
    }
  }

  async *streamText(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Text };
    await this.checkParams({ cond: fullCond, messages, options });
    const model = this.selectModel(fullCond);

    try {
      metrics.ai.counter('chat_text_stream_calls').add(1, { model: model.id });

      const [system, msgs] = await chatToGPTMessage(messages, false);

      const modelInstance = this.#instance(model.id);

      const stream = streamText({
        model: modelInstance,
        system,
        messages: msgs,
        temperature: options.temperature ?? 0,
        maxOutputTokens: options.maxTokens ?? 4096,
        abortSignal: options.signal,
      });

      const parser = new CitationParser();
      for await (const chunk of stream.fullStream) {
        switch (chunk.type) {
          case 'source': {
            if (chunk.sourceType === 'url') {
              parser.push(chunk.url);
            }
            break;
          }
          case 'text-delta': {
            const text = chunk.text.replaceAll(/<\/?think>\n?/g, '\n---\n');
            const result = parser.parse(text);
            yield result;
            break;
          }
          case 'finish-step': {
            const result = parser.end();
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
      metrics.ai.counter('chat_text_stream_errors').add(1, { model: model.id });
      throw e;
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
