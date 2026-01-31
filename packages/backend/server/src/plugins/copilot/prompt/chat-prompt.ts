import { type Tokenizer } from '@affine/server-native';
import { Logger } from '@nestjs/common';
import { AiPrompt } from '@prisma/client';
import Mustache from 'mustache';

import { getTokenEncoder } from '../../../native';
import { PromptConfig, PromptMessage, PromptParams } from '../providers';

// disable escaping
Mustache.escape = (text: string) => text;

function extractMustacheParams(template: string) {
  const regex = /\{\{\s*([^{}]+)\s*\}\}/g;
  const params = [];
  let match;

  while ((match = regex.exec(template)) !== null) {
    params.push(match[1]);
  }

  return Array.from(new Set(params));
}

export class ChatPrompt {
  private readonly logger = new Logger(ChatPrompt.name);
  public readonly encoder: Tokenizer | null;
  private readonly promptTokenSize: number;
  private readonly templateParamKeys: string[] = [];
  private readonly templateParams: PromptParams = {};

  static createFromPrompt(
    options: Omit<
      AiPrompt,
      'id' | 'createdAt' | 'updatedAt' | 'modified' | 'config'
    > & {
      messages: PromptMessage[];
      config: PromptConfig | undefined;
    }
  ) {
    return new ChatPrompt(
      options.name,
      options.action || undefined,
      options.model,
      options.optionalModels,
      options.config,
      options.messages
    );
  }

  constructor(
    public readonly name: string,
    public readonly action: string | undefined,
    public readonly model: string,
    public readonly optionalModels: string[],
    public readonly config: PromptConfig | undefined,
    private readonly messages: PromptMessage[]
  ) {
    this.encoder = getTokenEncoder(model);
    this.promptTokenSize = this.encode(messages.map(m => m.content).join(''));
    this.templateParamKeys = extractMustacheParams(
      messages.map(m => m.content).join('')
    );
    this.templateParams = messages.reduce(
      (acc, m) => Object.assign(acc, m.params),
      {} as PromptParams
    );
  }

  /**
   * get prompt token size
   */
  get tokens() {
    return this.promptTokenSize;
  }

  /**
   * get prompt param keys in template
   */
  get paramKeys() {
    return this.templateParamKeys.slice();
  }

  /**
   * get prompt params
   */
  get params() {
    return { ...this.templateParams };
  }

  encode(message: string) {
    return this.encoder?.count(message) || 0;
  }

  private checkParams(params: PromptParams, sessionId?: string) {
    const selfParams = this.templateParams;
    for (const key of Object.keys(selfParams)) {
      const options = selfParams[key];
      const income = params[key];
      if (
        typeof income !== 'string' ||
        (Array.isArray(options) && !options.includes(income))
      ) {
        if (sessionId) {
          const prefix = income
            ? `Invalid param value: ${key}=${income}`
            : `Missing param value: ${key}`;
          this.logger.warn(
            `${prefix} in session ${sessionId}, use default options: ${Array.isArray(options) ? options[0] : options}`
          );
        }
        if (Array.isArray(options)) {
          // use the first option if income is not in options
          params[key] = options[0];
        } else {
          params[key] = options;
        }
      }
    }
  }

  private preDefinedParams(params: PromptParams) {
    const {
      language,
      timezone,
      docs,
      contextFiles: files,
      selectedMarkdown,
      selectedSnapshot,
      html,
      currentDocId,
    } = params;
    return {
      'affine::date': new Date().toLocaleDateString(),
      'affine::language': language || 'same language as the user query',
      'affine::timezone': timezone || 'no preference',
      'affine::hasDocsRef': Array.isArray(docs) && docs.length > 0,
      'affine::hasFilesRef': Array.isArray(files) && files.length > 0,
      'affine::hasSelected': !!selectedMarkdown || !!selectedSnapshot || !!html,
      'affine::hasCurrentDoc':
        typeof currentDocId === 'string' && currentDocId.trim().length > 0,
    };
  }

  /**
   * render prompt messages with params
   * @param params record of params, e.g. { name: 'Alice' }
   * @returns e.g. [{ role: 'system', content: 'Hello, {{name}}' }] => [{ role: 'system', content: 'Hello, Alice' }]
   */
  finish(params: PromptParams, sessionId?: string): PromptMessage[] {
    this.checkParams(params, sessionId);

    const { attachments: attach, ...restParams } = Object.fromEntries(
      Object.entries(params).filter(([k]) => !k.startsWith('affine::'))
    );
    const paramsAttach = Array.isArray(attach) ? attach : [];

    return this.messages.map(
      ({ attachments: attach, content, params: _, ...rest }) => {
        const result: PromptMessage = {
          ...rest,
          params,
          content: Mustache.render(
            content,
            Object.assign({}, restParams, this.preDefinedParams(restParams))
          ),
        };

        const attachments = [
          ...(Array.isArray(attach) ? attach : []),
          ...paramsAttach,
        ];
        if (attachments.length && rest.role === 'user') {
          result.attachments = attachments;
        }
        return result;
      }
    );
  }
}
