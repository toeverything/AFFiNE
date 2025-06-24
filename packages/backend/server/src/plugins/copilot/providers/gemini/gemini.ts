import type {
  GoogleGenerativeAIProvider,
  GoogleGenerativeAIProviderOptions,
} from '@ai-sdk/google';
import type { GoogleVertexProvider } from '@ai-sdk/google-vertex';
import {
  AISDKError,
  generateObject,
  generateText,
  JSONParseError,
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

export type GeminiConfig = {
  apiKey: string;
  baseUrl?: string;
};

export abstract class GeminiProvider<T> extends CopilotProvider<T> {
  private readonly MAX_STEPS = 20;

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

      const modelInstance = this.instance(model.id, {
        structuredOutputs: true,
      });
      const { object } = await generateObject({
        model: modelInstance,
        system,
        messages: msgs,
        schema,
        abortSignal: options.signal,
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

  private async getFullStream(
    model: CopilotProviderModel,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ) {
    const [system, msgs] = await chatToGPTMessage(messages);
    const { fullStream } = streamText({
      model: this.instance(model.id, {
        useSearchGrounding: this.useSearchGrounding(options),
      }),
      system,
      messages: msgs,
      abortSignal: options.signal,
      maxSteps: this.MAX_STEPS,
      providerOptions: {
        google: this.getGeminiOptions(options, model.id),
      },
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

  private useSearchGrounding(options: CopilotChatOptions) {
    return options?.tools?.includes('webSearch');
  }
}
