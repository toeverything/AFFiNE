import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProvider,
} from '@ai-sdk/google';
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
} from '../../../base';
import { CopilotProvider } from './provider';
import {
  ChatMessageRole,
  CopilotCapability,
  CopilotChatOptions,
  CopilotProviderType,
  CopilotTextToTextProvider,
  PromptMessage,
} from './types';
import { chatToGPTMessage } from './utils';

export const DEFAULT_DIMENSIONS = 256;

export type GeminiConfig = {
  apiKey: string;
  baseUrl?: string;
};

export class GeminiProvider
  extends CopilotProvider<GeminiConfig>
  implements CopilotTextToTextProvider
{
  override readonly type = CopilotProviderType.Gemini;
  override readonly capabilities = [CopilotCapability.TextToText];
  override readonly models = [
    // text to text
    'gemini-2.0-flash-001',
    'gemini-2.5-pro-preview-03-25',
    // embeddings
    'text-embedding-004',
  ];

  #instance!: GoogleGenerativeAIProvider;

  override configured(): boolean {
    return !!this.config.apiKey;
  }

  protected override setup() {
    super.setup();
    this.#instance = createGoogleGenerativeAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
    });
  }

  protected async checkParams({
    messages,
    embeddings,
    model,
  }: {
    messages?: PromptMessage[];
    embeddings?: string[];
    model: string;
  }) {
    if (!(await this.isModelAvailable(model))) {
      throw new CopilotPromptInvalid(`Invalid model: ${model}`);
    }
    if (Array.isArray(messages) && messages.length > 0) {
      if (
        messages.some(
          m =>
            // check non-object
            typeof m !== 'object' ||
            !m ||
            // check content
            typeof m.content !== 'string' ||
            // content and attachments must exist at least one
            ((!m.content || !m.content.trim()) &&
              (!Array.isArray(m.attachments) || !m.attachments.length))
        )
      ) {
        throw new CopilotPromptInvalid('Empty message content');
      }
      if (
        messages.some(
          m =>
            typeof m.role !== 'string' ||
            !m.role ||
            !ChatMessageRole.includes(m.role)
        )
      ) {
        throw new CopilotPromptInvalid('Invalid message role');
      }
    } else if (
      Array.isArray(embeddings) &&
      embeddings.some(e => typeof e !== 'string' || !e || !e.trim())
    ) {
      throw new CopilotPromptInvalid('Invalid embedding');
    }
  }

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

  // ====== text to text ======
  async generateText(
    messages: PromptMessage[],
    model: string = 'gemini-2.0-flash-001',
    options: CopilotChatOptions = {}
  ): Promise<string> {
    await this.checkParams({ messages, model });

    try {
      metrics.ai.counter('chat_text_calls').add(1, { model });

      const [system, msgs, schema] = await chatToGPTMessage(messages);

      const modelInstance = this.#instance(model, {
        structuredOutputs: Boolean(options.jsonMode),
      });
      const { text } = schema
        ? await generateObject({
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
          }).then(r => ({ text: JSON.stringify(r.object) }))
        : await generateText({
            model: modelInstance,
            system,
            messages: msgs,
            abortSignal: options.signal,
          });

      if (!text) throw new Error('Failed to generate text');
      return text.trim();
    } catch (e: any) {
      metrics.ai.counter('chat_text_errors').add(1, { model });
      throw this.handleError(e);
    }
  }

  async *generateTextStream(
    messages: PromptMessage[],
    model: string = 'gemini-2.0-flash-001',
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    await this.checkParams({ messages, model });

    try {
      metrics.ai.counter('chat_text_stream_calls').add(1, { model });
      const [system, msgs] = await chatToGPTMessage(messages);

      const { textStream } = streamText({
        model: this.#instance(model),
        system,
        messages: msgs,
        abortSignal: options.signal,
      });

      for await (const message of textStream) {
        if (message) {
          yield message;
          if (options.signal?.aborted) {
            await textStream.cancel();
            break;
          }
        }
      }
    } catch (e: any) {
      metrics.ai.counter('chat_text_stream_errors').add(1, { model });
      throw this.handleError(e);
    }
  }
}
