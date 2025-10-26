import type {
  GoogleGenerativeAIProvider,
  GoogleGenerativeAIProviderOptions,
} from '@ai-sdk/google';
import type { GoogleVertexProvider } from '@ai-sdk/google-vertex';
import {
  AISDKError,
  embedMany,
  generateObject,
  generateText,
  JSONParseError,
  stepCountIs,
  streamText,
} from 'ai';

import {
  CopilotPromptInvalid,
  CopilotProviderSideError,
  metrics,
  UserFriendlyError,
} from '../../../../base';
import { CopilotProvider } from '../provider';
import type {
  CopilotChatOptions,
  CopilotEmbeddingOptions,
  CopilotImageOptions,
  CopilotProviderModel,
  ModelConditions,
  PromptMessage,
  StreamObject,
} from '../types';
import { ModelOutputType } from '../types';
import {
  chatToGPTMessage,
  StreamObjectParser,
  TextStreamParser,
} from '../utils';

export const DEFAULT_DIMENSIONS = 256;

export abstract class GeminiProvider<T> extends CopilotProvider<T> {
  protected abstract instance:
    | GoogleGenerativeAIProvider
    | GoogleVertexProvider;

  private handleError(e: any) {
    if (e instanceof UserFriendlyError) {
      return e;
    } else if (e instanceof AISDKError) {
      this.logger.error('Throw error from ai sdk:', e);
      return new CopilotProviderSideError({
        provider: this.type,
        kind: e.name || 'unknown',
        message: e.message,
      });
    } else {
      return new CopilotProviderSideError({
        provider: this.type,
        kind: 'unexpected_response',
        message: e?.message || 'Unexpected google response',
      });
    }
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

      const [system, msgs] = await chatToGPTMessage(messages);

      const modelInstance = this.instance(model.id);
      const { text } = await generateText({
        model: modelInstance,
        system,
        messages: msgs,
        abortSignal: options.signal,
        providerOptions: {
          google: this.getGeminiOptions(options, model.id),
        },
        tools: await this.getTools(options, model.id),
        stopWhen: stepCountIs(this.MAX_STEPS),
      });

      if (!text) throw new Error('Failed to generate text');
      return text.trim();
    } catch (e: any) {
      metrics.ai.counter('chat_text_errors').add(1, { model: model.id });
      throw this.handleError(e);
    }
  }

  override async structure(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): Promise<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Structured };
    await this.checkParams({ cond: fullCond, messages, options });
    const model = this.selectModel(fullCond);

    try {
      metrics.ai.counter('chat_text_calls').add(1, { model: model.id });

      const [system, msgs, schema] = await chatToGPTMessage(messages);
      if (!schema) {
        throw new CopilotPromptInvalid('Schema is required');
      }

      const modelInstance = this.instance(model.id);
      const { object } = await generateObject({
        model: modelInstance,
        system,
        messages: msgs,
        schema,
        providerOptions: {
          google: {
            thinkingConfig: {
              thinkingBudget: -1,
              includeThoughts: false,
            },
          },
        },
        abortSignal: options.signal,
        maxRetries: options.maxRetries || 3,
        experimental_repairText: async ({ text, error }) => {
          if (error instanceof JSONParseError) {
            // strange fixed response, temporarily replace it
            const ret = text.replaceAll(/^ny\n/g, ' ').trim();
            if (ret.startsWith('```') || ret.endsWith('```')) {
              return ret
                .replace(/```[\w\s]+\n/g, '')
                .replace(/\n```/g, '')
                .trim();
            }
            return ret;
          }
          return null;
        },
      });

      return JSON.stringify(object);
    } catch (e: any) {
      metrics.ai.counter('chat_text_errors').add(1, { model: model.id });
      throw this.handleError(e);
    }
  }

  async *streamText(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions | CopilotImageOptions = {}
  ): AsyncIterable<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Text };
    await this.checkParams({ cond: fullCond, messages, options });
    const model = this.selectModel(fullCond);

    try {
      metrics.ai.counter('chat_text_stream_calls').add(1, { model: model.id });
      const fullStream = await this.getFullStream(model, messages, options);
      const parser = new TextStreamParser();
      for await (const chunk of fullStream) {
        const result = parser.parse(chunk);
        yield result;
        if (options.signal?.aborted) {
          await fullStream.cancel();
          break;
        }
      }
      if (!options.signal?.aborted) {
        const footnotes = parser.end();
        if (footnotes.length) {
          yield `\n\n${footnotes}`;
        }
      }
    } catch (e: any) {
      metrics.ai.counter('chat_text_stream_errors').add(1, { model: model.id });
      throw this.handleError(e);
    }
  }

  override async *streamObject(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): AsyncIterable<StreamObject> {
    const fullCond = { ...cond, outputType: ModelOutputType.Object };
    await this.checkParams({ cond: fullCond, messages, options });
    const model = this.selectModel(fullCond);

    try {
      metrics.ai
        .counter('chat_object_stream_calls')
        .add(1, { model: model.id });
      const fullStream = await this.getFullStream(model, messages, options);
      const parser = new StreamObjectParser();
      for await (const chunk of fullStream) {
        const result = parser.parse(chunk);
        if (result) {
          yield result;
        }
        if (options.signal?.aborted) {
          await fullStream.cancel();
          break;
        }
      }
    } catch (e: any) {
      metrics.ai
        .counter('chat_object_stream_errors')
        .add(1, { model: model.id });
      throw this.handleError(e);
    }
  }

  override async embedding(
    cond: ModelConditions,
    messages: string | string[],
    options: CopilotEmbeddingOptions = { dimensions: DEFAULT_DIMENSIONS }
  ): Promise<number[][]> {
    messages = Array.isArray(messages) ? messages : [messages];
    const fullCond = { ...cond, outputType: ModelOutputType.Embedding };
    await this.checkParams({ embeddings: messages, cond: fullCond, options });
    const model = this.selectModel(fullCond);

    try {
      metrics.ai
        .counter('generate_embedding_calls')
        .add(1, { model: model.id });

      const modelInstance = this.instance.textEmbeddingModel(model.id);

      const embeddings = await Promise.allSettled(
        messages.map(m =>
          embedMany({
            model: modelInstance,
            values: [m],
            maxRetries: 3,
            providerOptions: {
              google: {
                outputDimensionality: options.dimensions || DEFAULT_DIMENSIONS,
                taskType: 'RETRIEVAL_DOCUMENT',
              },
            },
          })
        )
      );

      return embeddings
        .flatMap(e => (e.status === 'fulfilled' ? e.value.embeddings : null))
        .filter((v): v is number[] => !!v && Array.isArray(v));
    } catch (e: any) {
      metrics.ai
        .counter('generate_embedding_errors')
        .add(1, { model: model.id });
      throw this.handleError(e);
    }
  }

  private async getFullStream(
    model: CopilotProviderModel,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ) {
    const [system, msgs] = await chatToGPTMessage(messages);
    const { fullStream } = streamText({
      model: this.instance(model.id),
      system,
      messages: msgs,
      abortSignal: options.signal,
      providerOptions: {
        google: this.getGeminiOptions(options, model.id),
      },
      tools: await this.getTools(options, model.id),
      stopWhen: stepCountIs(this.MAX_STEPS),
    });
    return fullStream;
  }

  private getGeminiOptions(options: CopilotChatOptions, model: string) {
    const result: GoogleGenerativeAIProviderOptions = {};
    if (options?.reasoning && this.isReasoningModel(model)) {
      result.thinkingConfig = {
        thinkingBudget: 12000,
        includeThoughts: true,
      };
    }
    return result;
  }

  private isReasoningModel(model: string) {
    return model.startsWith('gemini-2.5');
  }
}
