import { Injectable, Logger } from '@nestjs/common';

import type { PromptMessage, PromptParams } from '../providers/types';
import {
  collectPromptMetadataNative,
  countPromptTokensNative,
  getBuiltInPromptSpecNative,
  renderBuiltInPromptNative,
  renderBuiltInPromptSessionNative,
  renderPromptNative,
  renderPromptSessionNative,
} from './native-contract';
import type { Prompt, PromptSpec, ResolvedPrompt } from './spec';

@Injectable()
export class PromptService {
  protected readonly logger = new Logger(PromptService.name);
  constructor() {
    this.logger.log('Using native built-in prompt catalog.');
  }

  async get(name: string): Promise<ResolvedPrompt | null> {
    const compatPrompt = this.lookupCompatPrompt(name);
    if (compatPrompt) {
      return this.describeCompatPrompt(this.clonePrompt(compatPrompt));
    }

    const builtInPromptSpec = this.lookupBuiltInPromptSpec(name);
    if (!builtInPromptSpec) return null;

    return this.describeBuiltInPromptSpec(builtInPromptSpec);
  }

  finish(
    prompt: ResolvedPrompt,
    params: PromptParams,
    sessionId?: string
  ): PromptMessage[] {
    const rendered =
      prompt.source === 'built_in'
        ? renderBuiltInPromptNative({
            name: prompt.name,
            renderParams: params,
          })
        : renderPromptNative({
            messages: this.requireCompatMessages(prompt),
            templateParams: prompt.params,
            renderParams: params,
          });

    this.logWarnings(rendered.warnings, sessionId);
    return rendered.messages;
  }

  renderSession(
    prompt: ResolvedPrompt,
    turns: PromptMessage[],
    params: PromptParams,
    maxTokenSize = prompt.config?.maxTokens || 128 * 1024,
    sessionId?: string
  ): PromptMessage[] {
    const rendered =
      prompt.source === 'built_in'
        ? renderBuiltInPromptSessionNative({
            name: prompt.name,
            turns,
            renderParams: params,
            maxTokenSize,
          })
        : renderPromptSessionNative({
            prompt: {
              action: prompt.action,
              model: prompt.model,
              promptTokens: this.countCompatPromptTokens(prompt),
              templateParams: prompt.params,
              messages: this.requireCompatMessages(prompt),
            },
            turns,
            renderParams: params,
            maxTokenSize,
          });

    this.logWarnings(rendered.warnings, sessionId);
    return rendered.messages;
  }

  protected lookupCompatPrompt(_name: string): Prompt | null {
    return null;
  }

  protected lookupBuiltInPromptSpec(name: string): PromptSpec | null {
    const spec = getBuiltInPromptSpecNative(name);
    return spec ? this.clonePromptSpec(spec) : null;
  }

  protected cloneMessages(messages: PromptMessage[]) {
    return messages.map(message => ({
      ...message,
      attachments: message.attachments ? [...message.attachments] : undefined,
      params: message.params ? structuredClone(message.params) : undefined,
      responseFormat: message.responseFormat
        ? structuredClone(message.responseFormat)
        : undefined,
    }));
  }

  protected clonePrompt(prompt: Prompt): Prompt {
    return {
      ...prompt,
      optionalModels: prompt.optionalModels
        ? [...prompt.optionalModels]
        : undefined,
      config: prompt.config ? structuredClone(prompt.config) : undefined,
      messages: this.cloneMessages(prompt.messages),
    };
  }

  protected clonePromptSpec(spec: PromptSpec): PromptSpec {
    return {
      ...spec,
      optionalModels: spec.optionalModels
        ? [...spec.optionalModels]
        : undefined,
      config: spec.config ? structuredClone(spec.config) : undefined,
      params: spec.params ? structuredClone(spec.params) : undefined,
      messages: spec.messages.map(message => ({ ...message })),
    };
  }

  private describeBuiltInPromptSpec(spec: PromptSpec): ResolvedPrompt {
    const params = this.normalizePromptSpecParams(spec.params);
    return {
      name: spec.name,
      action: spec.action,
      model: spec.model,
      optionalModels: spec.optionalModels ?? [],
      config: spec.config ? structuredClone(spec.config) : undefined,
      paramKeys: Object.keys(params),
      params,
      source: 'built_in',
    };
  }

  private describeCompatPrompt(prompt: Prompt): ResolvedPrompt {
    const metadata = collectPromptMetadataNative({ messages: prompt.messages });
    return {
      name: prompt.name,
      action: prompt.action,
      model: prompt.model,
      optionalModels: prompt.optionalModels ?? [],
      config: prompt.config ? structuredClone(prompt.config) : undefined,
      paramKeys: metadata.paramKeys,
      params: metadata.templateParams,
      source: 'compat',
      messages: prompt.messages,
    };
  }

  private normalizePromptSpecParams(
    params?: PromptSpec['params']
  ): PromptParams {
    if (!params) return {};

    return Object.fromEntries(
      Object.entries(params).map(([key, value]) => {
        if (value.enum?.length) {
          const normalized = value.default
            ? [
                value.default,
                ...value.enum.filter(option => option !== value.default),
              ]
            : [...value.enum];
          return [key, normalized];
        }

        return [key, value.default ?? ''];
      })
    );
  }

  private countCompatPromptTokens(prompt: ResolvedPrompt): number {
    return countPromptTokensNative({
      model: prompt.model,
      messages: this.requireCompatMessages(prompt).map(message => ({
        content: message.content,
      })),
    }).tokens;
  }

  private requireCompatMessages(prompt: ResolvedPrompt): PromptMessage[] {
    if (prompt.source === 'compat' && prompt.messages) {
      return this.cloneMessages(prompt.messages);
    }

    throw new Error(`Prompt ${prompt.name} does not expose compat messages`);
  }

  private logWarnings(warnings: string[], sessionId?: string) {
    if (!sessionId) {
      return;
    }

    for (const warning of warnings) {
      this.logger.warn(`${warning} in session ${sessionId}`);
    }
  }
}
