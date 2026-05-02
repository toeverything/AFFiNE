import { Injectable } from '@nestjs/common';

import { CopilotPromptNotFound } from '../../../base';
import { PromptService } from '../prompt/service';
import {
  type CopilotChatOptions,
  type CopilotProviderType,
  type CopilotStructuredOptions,
  type PromptMessage,
  type PromptParams,
} from '../providers/types';
import { CapabilityRuntime } from './capability-runtime';
import type { RequiredStructuredOutputContract } from './contracts';
import { CapabilityPolicyHost } from './hosts/capability-policy-host';

type PromptRuntimeStructuredContract = RequiredStructuredOutputContract;

type PromptRuntimeStructuredProviderOptions = Omit<
  NonNullable<CopilotStructuredOptions>,
  'responseSchemaJson' | 'schemaHash'
>;

@Injectable()
export class PromptRuntime {
  constructor(
    private readonly prompts: PromptService,
    private readonly capabilityPolicy: CapabilityPolicyHost,
    private readonly runtime: CapabilityRuntime
  ) {}

  private async preparePrompt(
    promptName: string,
    params: PromptParams,
    options: {
      modelId?: string;
      prefer?: CopilotProviderType;
      appendMessages?: PromptMessage[];
    } = {}
  ) {
    const prompt = await this.prompts.get(promptName);
    if (!prompt) {
      throw new CopilotPromptNotFound({ name: promptName });
    }

    return {
      prompt,
      modelId: await this.capabilityPolicy.resolvePromptModel({
        defaultModel: prompt.model,
        optionalModels: prompt.optionalModels,
        requestedModelId: options.modelId,
      }),
      finalMessages: [
        ...this.prompts.finish(prompt, params),
        ...(options.appendMessages ?? []),
      ],
      prefer: options.prefer,
    };
  }

  async runText(
    promptName: string,
    params: PromptParams,
    options: {
      modelId?: string;
      prefer?: CopilotProviderType;
      appendMessages?: PromptMessage[];
      providerOptions?: CopilotChatOptions;
    } = {}
  ) {
    const prepared = await this.preparePrompt(promptName, params, options);

    return await this.runtime.text(
      { modelId: prepared.modelId },
      prepared.finalMessages,
      {
        ...prepared.prompt.config,
        ...options.providerOptions,
      },
      { prefer: prepared.prefer }
    );
  }

  async runStructured(
    promptName: string,
    params: PromptParams,
    options: {
      responseContract: PromptRuntimeStructuredContract;
      modelId?: string;
      prefer?: CopilotProviderType;
      appendMessages?: PromptMessage[];
      providerOptions?: PromptRuntimeStructuredProviderOptions;
      strict?: boolean;
    }
  ) {
    const prepared = await this.preparePrompt(promptName, params, options);

    return await this.runtime.generateStructuredValue(
      { modelId: prepared.modelId },
      prepared.finalMessages,
      {
        ...prepared.prompt.config,
        ...options.providerOptions,
        responseSchemaJson: options.responseContract.responseSchemaJson,
        schemaHash: options.responseContract.schemaHash,
        strict: options.strict,
      },
      options.responseContract,
      { prefer: prepared.prefer }
    );
  }
}
