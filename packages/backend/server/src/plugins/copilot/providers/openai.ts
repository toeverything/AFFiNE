import { Inject } from '@nestjs/common';

import {
  CopilotProviderSideError,
  OneMB,
  UserFriendlyError,
} from '../../../base';
import {
  type LlmBackendConfig,
  llmResolveRequestIntentOptions,
} from '../../../native';
import {
  admittedAttachmentToPromptAttachment,
  AttachmentAdmissionHost,
} from '../runtime/hosts/attachment-admission';
import { AttachmentMaterializer } from '../runtime/hosts/attachment-materializer';
import { CopilotProvider } from './provider';
import { hasProviderModelBehaviorFlag } from './provider-model-runtime';
import type {
  CopilotProviderExecution,
  ProviderDriverSpec,
} from './provider-runtime-contract';
import {
  CopilotProviderType,
  type PromptAttachment,
  type PromptMessage,
} from './types';
import { promptAttachmentToUrl } from './utils';

export const DEFAULT_DIMENSIONS = 256;

export type OpenAIConfig = {
  apiKey: string;
  baseURL?: string;
  oldApiStyle?: boolean;
};

export class OpenAIProvider extends CopilotProvider<OpenAIConfig> {
  readonly type = CopilotProviderType.OpenAI;
  @Inject() protected readonly attachmentMaterializer!: AttachmentMaterializer;
  @Inject()
  protected readonly attachmentAdmissionHost?: AttachmentAdmissionHost;

  protected resolveModelBackendKind(execution?: CopilotProviderExecution) {
    return this.getConfig(execution).oldApiStyle
      ? ('openai_chat' as const)
      : ('openai_responses' as const);
  }

  override configured(execution?: CopilotProviderExecution): boolean {
    return !!this.getConfig(execution).apiKey;
  }

  private handleError(e: any) {
    if (e instanceof UserFriendlyError) {
      return e;
    }
    return new CopilotProviderSideError({
      provider: this.type,
      kind: 'unexpected_response',
      message: e?.message || 'Unexpected openai response',
    });
  }

  protected createNativeConfig(
    execution?: CopilotProviderExecution
  ): LlmBackendConfig {
    const config = this.getConfig(execution);
    const baseUrl = config.baseURL || 'https://api.openai.com/v1';
    return {
      base_url: baseUrl.replace(/\/v1\/?$/, ''),
      auth_token: config.apiKey,
    };
  }

  private getAttachmentAdmissionHost() {
    return (
      this.attachmentAdmissionHost ??
      new AttachmentAdmissionHost(this.attachmentMaterializer)
    );
  }

  private async prepareImageMessages(
    messages: PromptMessage[],
    options: {
      signal?: AbortSignal;
      user?: string;
      workspace?: string;
      session?: string;
    }
  ) {
    const prepared: PromptMessage[] = [];

    for (const message of messages) {
      options.signal?.throwIfAborted();
      if (!Array.isArray(message.attachments) || !message.attachments.length) {
        prepared.push(message);
        continue;
      }

      let changed = false;
      const attachments: PromptAttachment[] = [];
      for (const attachment of message.attachments) {
        options.signal?.throwIfAborted();
        const url = promptAttachmentToUrl(attachment);
        if (!url || url.startsWith('data:')) {
          attachments.push(attachment);
          continue;
        }

        const admitted =
          await this.getAttachmentAdmissionHost().admitPromptAttachment(
            attachment,
            {
              userId: options.user ?? 'provider-runtime',
              workspaceId: options.workspace ?? 'provider-runtime',
              sessionId: options.session,
              signal: options.signal,
              maxBytes: 50 * OneMB,
            }
          );
        attachments.push(admittedAttachmentToPromptAttachment(admitted));
        changed = true;
      }

      prepared.push(changed ? { ...message, attachments } : message);
    }

    return prepared;
  }

  override getDriverSpec(): ProviderDriverSpec {
    return {
      createBackendConfig: execution => this.createNativeConfig(execution),
      mapError: error => this.handleError(error),
      chat: {
        resolveRequestOptions: async context => {
          const requestIntent = await llmResolveRequestIntentOptions({
            protocol: context.protocol,
            backendConfig: context.backendConfig,
            include: context.options.webSearch ? ['citations'] : undefined,
            reasoning: {
              enabled: context.options.reasoning,
              supported: hasProviderModelBehaviorFlag(
                context.model,
                'reasoning_supported'
              ),
            },
          });

          return {
            attachmentCapability: this.getAttachCapability(
              context.model,
              context.outputType
            ),
            include: requestIntent.include,
            reasoning: requestIntent.reasoning,
          };
        },
      },
      structured: {},
      embedding: {
        defaultDimensions: DEFAULT_DIMENSIONS,
        taskType: 'RETRIEVAL_DOCUMENT',
      },
      image: {
        prepareMessages: async (messages, _backendConfig, options) =>
          await this.prepareImageMessages(messages, options),
      },
    };
  }
}
