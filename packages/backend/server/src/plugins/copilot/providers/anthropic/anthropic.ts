import {
  type AnthropicProvider as AnthropicSDKProvider,
  type AnthropicProviderOptions,
} from '@ai-sdk/anthropic';
import { type GoogleVertexAnthropicProvider } from '@ai-sdk/google-vertex/anthropic';
import { AISDKError, generateText, stepCountIs, streamText } from 'ai';

import {
  CopilotProviderSideError,
  metrics,
  UserFriendlyError,
} from '../../../../base';
import { CopilotProvider } from '../provider';
import type {
  CopilotChatOptions,
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

export abstract class AnthropicProvider<T> extends CopilotProvider<T> {
  protected abstract instance:
    | AnthropicSDKProvider
    | GoogleVertexAnthropicProvider;

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
        message: e?.message || 'Unexpected anthropic response',
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

      const [system, msgs] = await chatToGPTMessage(messages, true, true);

      const modelInstance = this.instance(model.id);
      const { text, reasoning } = await generateText({
        model: modelInstance,
        system,
        messages: msgs,
        abortSignal: options.signal,
        providerOptions: {
          anthropic: this.getAnthropicOptions(options, model.id),
        },
        tools: await this.getTools(options, model.id),
        stopWhen: stepCountIs(this.MAX_STEPS),
      });

      if (!text) throw new Error('Failed to generate text');

      return reasoning ? `${reasoning}\n${text}` : text;
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

  private async getFullStream(
    model: CopilotProviderModel,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ) {
    const [system, msgs] = await chatToGPTMessage(messages, true, true);
    const { fullStream } = streamText({
      model: this.instance(model.id),
      system,
      messages: msgs,
      abortSignal: options.signal,
      providerOptions: {
        anthropic: this.getAnthropicOptions(options, model.id),
      },
      tools: await this.getTools(options, model.id),
      stopWhen: stepCountIs(this.MAX_STEPS),
    });
    return fullStream;
  }

  private getAnthropicOptions(options: CopilotChatOptions, model: string) {
    const result: AnthropicProviderOptions = {};
    if (options?.reasoning && this.isReasoningModel(model)) {
      result.thinking = {
        type: 'enabled',
        budgetTokens: 12000,
      };
    }
    return result;
  }

  private isReasoningModel(model: string) {
    // claude 3.5 sonnet doesn't support reasoning config
    return model.includes('sonnet') && !model.startsWith('claude-3-5-sonnet');
  }
}
