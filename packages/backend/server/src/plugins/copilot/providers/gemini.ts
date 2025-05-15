import { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import { createVertex, type GoogleVertexProvider } from '@ai-sdk/google-vertex';
import {
  AISDKError,
  generateObject,
  generateText,
  JSONParseError,
  streamText,
} from 'ai';
import { z } from 'zod';

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
  privateKey: string;
};

const PrivateKeySchema = z.object({
  type: z.string(),
  client_email: z.string(),
  private_key: z.string(),
  private_key_id: z.string(),
  project_id: z.string(),
  client_id: z.string(),
  universe_domain: z.string().optional(),
});

type PrivateKey = z.infer<typeof PrivateKeySchema>;

export class GeminiProvider
  extends CopilotProvider<GeminiConfig>
  implements CopilotTextToTextProvider
{
  override readonly type = CopilotProviderType.Gemini;
  override readonly capabilities = [CopilotCapability.TextToText];
  override readonly models = [
    // text to text
    'gemini-2.0-flash-001',
    'gemini-2.5-flash-preview-04-17',
    'gemini-2.5-pro-preview-05-06',
    // embeddings
    'text-embedding-004',
  ];

  private readonly MAX_STEPS = 20;

  private readonly CALLOUT_PREFIX = '\n> [!]\n> ';

  #instance!: GoogleVertexProvider;

  override configured(): boolean {
    return !!this.parsePrivateKey(this.config.privateKey);
  }

  protected override setup() {
    super.setup();

    const parsed = this.parsePrivateKey(this.config.privateKey);
    if (!parsed) {
      throw new CopilotProviderSideError({
        provider: this.type,
        kind: 'invalid_credentials',
        message: 'Gemini provider: malformed or missing private key JSON.',
      });
    }
    this.#instance = createVertex({
      project: parsed.project_id,
      location: 'us-central1',
      googleAuthOptions: {
        credentials: {
          type: parsed.type,
          client_email: parsed.client_email,
          private_key: parsed.private_key,
          private_key_id: parsed.private_key_id,
          project_id: parsed.project_id,
          client_id: parsed.client_id,
          universe_domain: parsed.universe_domain,
        },
      },
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

      const { fullStream } = streamText({
        model: this.#instance(model, {
          useSearchGrounding: this.withWebSearch(options),
        }),
        system,
        messages: msgs,
        abortSignal: options.signal,
        maxSteps: this.MAX_STEPS,
        providerOptions: {
          google: this.getGeminiOptions(options, model),
        },
      });

      let lastType;
      // reasoning, tool-call, tool-result need to mark as callout
      let prefix: string | null = this.CALLOUT_PREFIX;
      for await (const chunk of fullStream) {
        if (chunk) {
          switch (chunk.type) {
            case 'text-delta': {
              let result = chunk.textDelta;
              if (lastType !== chunk.type) {
                result = '\n\n' + result;
              }
              yield result;
              break;
            }
            case 'reasoning': {
              if (prefix) {
                yield prefix;
                prefix = null;
              }
              let result = chunk.textDelta;
              if (lastType !== chunk.type) {
                result = '\n\n' + result;
              }
              yield this.markAsCallout(result);
              break;
            }
            case 'error': {
              const error = chunk.error as { type: string; message: string };
              throw new Error(error.message);
            }
          }

          if (options.signal?.aborted) {
            await fullStream.cancel();
            break;
          }
          lastType = chunk.type;
        }
      }
    } catch (e: any) {
      metrics.ai.counter('chat_text_stream_errors').add(1, { model });
      throw this.handleError(e);
    }
  }

  private getGeminiOptions(options: CopilotChatOptions, model: string) {
    const result: GoogleGenerativeAIProviderOptions = {};
    if (options?.reasoning && this.isThinkingModel(model)) {
      result.thinkingConfig = {
        thinkingBudget: 12000,
        includeThoughts: true,
      };
    }
    return result;
  }

  private markAsCallout(text: string) {
    return text.replaceAll('\n', '\n> ');
  }

  private isThinkingModel(model: string) {
    // TODO gemini-2.5-pro-preview is not supported thinking yet
    return model.startsWith('gemini-2.5-flash-preview');
  }

  private withWebSearch(options: CopilotChatOptions) {
    return options?.tools?.includes('webSearch');
  }

  private parsePrivateKey(jsonString: string): PrivateKey | null {
    try {
      return PrivateKeySchema.parse(JSON.parse(jsonString));
    } catch {
      return null;
    }
  }
}
