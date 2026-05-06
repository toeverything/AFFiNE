import { Injectable } from '@nestjs/common';

import { CopilotPromptInvalid } from '../../base';
import { llmGetBuiltInPromptSpec, llmRenderBuiltInPrompt } from '../../native';
import { PromptService } from '../../plugins/copilot/prompt';
import type { Prompt } from '../../plugins/copilot/prompt/spec';
import type {
  PromptConfig,
  PromptMessage,
} from '../../plugins/copilot/providers/types';

@Injectable()
export class TestingPromptService extends PromptService {
  private readonly customPrompts = new Map<string, Prompt>();
  private readonly builtInPromptOverrides = new Map<string, Prompt>();

  reset() {
    this.customPrompts.clear();
    this.builtInPromptOverrides.clear();
  }

  async set(
    name: string,
    model: string,
    messages: PromptMessage[],
    config?: PromptConfig | null,
    extraConfig?: { optionalModels: string[] }
  ) {
    this.assertCustomPromptName(name);

    const existing = this.customPrompts.get(name);
    this.customPrompts.set(name, {
      name,
      model,
      action: existing?.action,
      optionalModels: existing?.optionalModels?.length
        ? [...existing.optionalModels, ...(extraConfig?.optionalModels ?? [])]
        : extraConfig?.optionalModels,
      config: config ? structuredClone(config) : undefined,
      messages: this.cloneMessages(messages),
    });
  }

  async overrideBuiltIn(
    name: string,
    data: {
      messages?: PromptMessage[];
      model?: string;
      config?: PromptConfig | null;
    }
  ) {
    const current = this.loadBuiltInPrompt(name);
    if (!current) {
      throw new CopilotPromptInvalid(
        `Built-in prompt ${name} not found in native catalog`
      );
    }

    const { config, messages, model } = data;
    const next = this.clonePrompt(current);
    if (model !== undefined) {
      next.model = model;
    }
    if (config === null) {
      next.config = undefined;
    } else if (config !== undefined) {
      next.config = structuredClone(config);
    }
    if (messages) {
      next.messages = this.cloneMessages(messages);
    }

    this.builtInPromptOverrides.set(name, next);
  }

  protected override lookupCompatPrompt(name: string) {
    return (
      this.builtInPromptOverrides.get(name) ??
      this.customPrompts.get(name) ??
      null
    );
  }

  private assertCustomPromptName(name: string) {
    if (this.loadBuiltInPrompt(name)) {
      throw new CopilotPromptInvalid(
        `Built-in prompt ${name} is owned by native catalog`
      );
    }
  }

  private loadBuiltInPrompt(name: string): Prompt | null {
    const spec = llmGetBuiltInPromptSpec(name);
    if (!spec) return null;
    const prompt = llmRenderBuiltInPrompt({ name, renderParams: {} });

    return {
      name: spec.name,
      action: spec.action,
      model: spec.model,
      optionalModels: spec.optionalModels,
      config: spec.config,
      messages: prompt.messages.map(message => ({
        role: message.role,
        content: message.content,
        ...(message.params ? { params: message.params } : {}),
      })),
    };
  }
}
