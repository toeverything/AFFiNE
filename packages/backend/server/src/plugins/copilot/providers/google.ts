import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProvider,
} from '@ai-sdk/google';
import { Logger } from '@nestjs/common';
import {
  AISDKError,
  type CoreAssistantMessage,
  type CoreUserMessage,
  FilePart,
  generateText,
  streamText,
  TextPart,
} from 'ai';

import {
  CopilotPromptInvalid,
  CopilotProviderSideError,
  metrics,
  UserFriendlyError,
} from '../../../base';
import {
  ChatMessageRole,
  CopilotCapability,
  CopilotChatOptions,
  CopilotProviderType,
  CopilotTextToTextProvider,
  PromptMessage,
} from '../types';

export const DEFAULT_DIMENSIONS = 256;

const SIMPLE_IMAGE_URL_REGEX = /^(https?:\/\/|data:image\/)/;
const FORMAT_INFER_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  txt: 'text/plain',
  md: 'text/plain',
  mov: 'video/mov',
  mpeg: 'video/mpeg',
  mp4: 'video/mp4',
  avi: 'video/avi',
  wmv: 'video/wmv',
  flv: 'video/flv',
};

export type GoogleConfig = {
  apiKey: string;
  baseUrl?: string;
};

type ChatMessage = CoreUserMessage | CoreAssistantMessage;

export class GoogleProvider implements CopilotTextToTextProvider {
  static readonly type = CopilotProviderType.Google;
  static readonly capabilities = [CopilotCapability.TextToText];

  readonly availableModels = [
    // text to text
    'gemini-2.0-flash-001',
    // embeddings
    'text-embedding-004',
  ];

  private readonly logger = new Logger(GoogleProvider.name);
  private readonly instance: GoogleGenerativeAIProvider;

  constructor(config: GoogleConfig) {
    this.instance = createGoogleGenerativeAI(config);
  }

  static assetsConfig(config: GoogleConfig) {
    return !!config?.apiKey;
  }

  get type(): CopilotProviderType {
    return GoogleProvider.type;
  }

  getCapabilities(): CopilotCapability[] {
    return GoogleProvider.capabilities;
  }

  async isModelAvailable(model: string): Promise<boolean> {
    return this.availableModels.includes(model);
  }

  private inferMimeType(url: string) {
    if (url.startsWith('data:')) {
      return url.split(';')[0].split(':')[1];
    }
    const extension = url.split('.').pop();
    if (extension) {
      return FORMAT_INFER_MAP[extension];
    }
    return undefined;
  }

  protected async chatToGPTMessage(
    messages: PromptMessage[]
  ): Promise<[string | undefined, ChatMessage[]]> {
    let system =
      messages[0]?.role === 'system' ? messages.shift()?.content : undefined;

    // filter redundant fields
    const msgs: ChatMessage[] = [];
    for (let { role, content, attachments, params } of messages.filter(
      m => m.role !== 'system'
    )) {
      content = content.trim();
      role = role as 'user' | 'assistant';
      const mimetype = params?.mimetype;
      if (Array.isArray(attachments)) {
        const contents: (TextPart | FilePart)[] = [];
        if (content.length) {
          contents.push({
            type: 'text',
            text: content,
          });
        }

        for (const url of attachments) {
          if (SIMPLE_IMAGE_URL_REGEX.test(url)) {
            const mimeType =
              typeof mimetype === 'string' ? mimetype : this.inferMimeType(url);
            if (mimeType) {
              const data = url.startsWith('data:')
                ? await fetch(url).then(r => r.arrayBuffer())
                : new URL(url);
              contents.push({
                type: 'file' as const,
                data,
                mimeType,
              });
            }
          }
        }

        msgs.push({ role, content: contents } as ChatMessage);
      } else {
        msgs.push({ role, content });
      }
    }

    return [system, msgs];
  }

  protected async checkParams({
    messages,
    embeddings,
    model,
    options = {},
  }: {
    messages?: PromptMessage[];
    embeddings?: string[];
    model: string;
    options: CopilotChatOptions;
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
      // json mode need 'json' keyword in content
      // ref: https://platform.openai.com/docs/api-reference/chat/create#chat-create-response_format
      if (
        options.jsonMode &&
        !messages.some(m => m.content.toLowerCase().includes('json'))
      ) {
        throw new CopilotPromptInvalid('Prompt not support json mode');
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
    await this.checkParams({ messages, model, options });

    try {
      metrics.ai.counter('chat_text_calls').add(1, { model });

      const [system, msgs] = await this.chatToGPTMessage(messages);

      const { text } = await generateText({
        model: this.instance(model, {
          audioTimestamp: Boolean(options.audioTimestamp),
          structuredOutputs: Boolean(options.jsonMode),
        }),
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
    model: string = 'gpt-4o-mini',
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    await this.checkParams({ messages, model, options });

    try {
      metrics.ai.counter('chat_text_stream_calls').add(1, { model });
      const [system, msgs] = await this.chatToGPTMessage(messages);

      const { textStream } = streamText({
        model: this.instance(model),
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
