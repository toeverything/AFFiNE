import { setTimeout as delay } from 'node:timers/promises';

import { Inject } from '@nestjs/common';
import { ZodError } from 'zod';

import {
  CopilotProviderSideError,
  OneMB,
  UserFriendlyError,
} from '../../../../base';
import {
  isInvalidStructuredOutputError,
  type LlmBackendConfig,
  llmResolveRequestIntentOptions,
} from '../../../../native';
import {
  admittedAttachmentToPromptAttachment,
  AttachmentAdmissionHost,
} from '../../runtime/hosts/attachment-admission';
import {
  planAdmittedAttachmentMaterialization,
  planHostUrlAttachmentMaterialization,
} from '../../runtime/hosts/attachment-materialization-planner';
import { AttachmentMaterializer } from '../../runtime/hosts/attachment-materializer';
import { CopilotProvider } from '../provider';
import { hasProviderModelBehaviorFlag } from '../provider-model-runtime';
import {
  type CopilotProviderExecution,
  type ProviderDriverSpec,
} from '../provider-runtime-contract';
import type { PromptAttachment, PromptMessage } from '../types';
import { promptAttachmentMimeType, promptAttachmentToUrl } from '../utils';

export const DEFAULT_DIMENSIONS = 256;
const GEMINI_REMOTE_ATTACHMENT_MAX_BYTES = 64 * OneMB;
const TRUSTED_ATTACHMENT_HOST_SUFFIXES = ['cdn.affine.pro'];
const GEMINI_RETRY_INITIAL_DELAY_MS = 2_000;

function normalizeMimeType(mediaType?: string) {
  return mediaType?.split(';', 1)[0]?.trim() || 'application/octet-stream';
}

export abstract class GeminiProvider<T> extends CopilotProvider<T> {
  @Inject() protected readonly attachmentMaterializer!: AttachmentMaterializer;
  @Inject()
  protected readonly attachmentAdmissionHost?: AttachmentAdmissionHost;

  protected resolveModelBackendKind() {
    return this.type === 'geminiVertex'
      ? ('gemini_vertex' as const)
      : ('gemini_api' as const);
  }

  protected abstract createNativeConfig(
    execution?: CopilotProviderExecution
  ): Promise<LlmBackendConfig>;

  private handleError(e: any) {
    if (e instanceof UserFriendlyError) {
      return e;
    } else {
      return new CopilotProviderSideError({
        provider: this.type,
        kind: 'unexpected_response',
        message: e?.message || 'Unexpected google response',
      });
    }
  }

  private getAttachmentAdmissionHost() {
    return (
      this.attachmentAdmissionHost ??
      new AttachmentAdmissionHost(this.attachmentMaterializer)
    );
  }

  protected async prepareMessages(
    messages: PromptMessage[],
    backendConfig: LlmBackendConfig,
    options?: {
      signal?: AbortSignal;
      user?: string;
      workspace?: string;
      session?: string;
    }
  ): Promise<PromptMessage[]> {
    const prepared: PromptMessage[] = [];

    for (const message of messages) {
      options?.signal?.throwIfAborted();
      if (!Array.isArray(message.attachments) || !message.attachments.length) {
        prepared.push(message);
        continue;
      }

      const attachments: PromptAttachment[] = [];
      let changed = false;
      for (const attachment of message.attachments) {
        options?.signal?.throwIfAborted();
        const rawUrl = promptAttachmentToUrl(attachment);
        if (!rawUrl || rawUrl.startsWith('data:')) {
          attachments.push(attachment);
          continue;
        }

        try {
          new URL(rawUrl);
        } catch {
          attachments.push(attachment);
          continue;
        }

        const declaredMimeType = promptAttachmentMimeType(
          attachment,
          typeof message.params?.mimetype === 'string'
            ? message.params.mimetype
            : undefined
        );
        const referencePlan = await planHostUrlAttachmentMaterialization(
          'gemini',
          backendConfig,
          {
            attachmentId: rawUrl,
            url: rawUrl,
            expectedMime: declaredMimeType
              ? normalizeMimeType(declaredMimeType)
              : undefined,
            maxSize: GEMINI_REMOTE_ATTACHMENT_MAX_BYTES,
          }
        );
        if (referencePlan.mode === 'remote_reference') {
          attachments.push(attachment);
          continue;
        }

        const admitted =
          await this.getAttachmentAdmissionHost().admitPromptAttachment(
            attachment,
            {
              userId: options?.user ?? 'provider-runtime',
              workspaceId: options?.workspace ?? 'provider-runtime',
              sessionId: options?.session,
              signal: options?.signal,
              maxBytes: referencePlan.request.maxSize,
              trustedHostSuffixes: TRUSTED_ATTACHMENT_HOST_SUFFIXES,
            }
          );
        const materialization = planAdmittedAttachmentMaterialization(admitted);
        attachments.push(
          materialization.mode === 'inline'
            ? materialization.attachment
            : admittedAttachmentToPromptAttachment(admitted)
        );
        changed = true;
      }

      prepared.push(changed ? { ...message, attachments } : message);
    }

    return prepared;
  }

  protected async waitForStructuredRetry(
    delayMs: number,
    signal?: AbortSignal
  ) {
    await delay(delayMs, undefined, signal ? { signal } : undefined);
  }

  override getDriverSpec(): ProviderDriverSpec {
    return {
      createBackendConfig: execution => this.createNativeConfig(execution),
      mapError: error => this.handleError(error),
      chat: {
        prepareMessages: async context =>
          await this.prepareMessages(
            context.input.messages,
            context.backendConfig,
            context.options
          ),
        resolveRequestOptions: async context => {
          const requestIntent = await llmResolveRequestIntentOptions({
            protocol: context.protocol,
            backendConfig: context.backendConfig,
            reasoning: {
              enabled: context.options.reasoning,
              supported:
                hasProviderModelBehaviorFlag(
                  context.model,
                  'reasoning_medium'
                ) ||
                hasProviderModelBehaviorFlag(context.model, 'reasoning_high'),
              effort: hasProviderModelBehaviorFlag(
                context.model,
                'reasoning_high'
              )
                ? 'high'
                : 'medium',
              includeReasoning:
                hasProviderModelBehaviorFlag(
                  context.model,
                  'reasoning_medium'
                ) ||
                hasProviderModelBehaviorFlag(context.model, 'reasoning_high'),
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
      structured: {
        prepareMessages: (inputMessages, backendConfig, structuredOptions) =>
          this.prepareMessages(inputMessages, backendConfig, structuredOptions),
        shouldRetry: async ({ error, attempt, options: structuredOptions }) => {
          const isParsingError =
            isInvalidStructuredOutputError(error) || error instanceof ZodError;
          const retryableError =
            isParsingError || !(error instanceof UserFriendlyError);
          const maxRetries = Math.max(structuredOptions.maxRetries ?? 3, 0);
          if (!retryableError || attempt >= maxRetries) {
            return false;
          }
          if (!isParsingError) {
            await this.waitForStructuredRetry(
              GEMINI_RETRY_INITIAL_DELAY_MS * 2 ** attempt,
              structuredOptions.signal
            );
          }
          return true;
        },
      },
      embedding: {
        defaultDimensions: DEFAULT_DIMENSIONS,
        taskType: 'RETRIEVAL_DOCUMENT',
      },
      rerank: false,
      image: {
        prepareMessages: (inputMessages, backendConfig, imageOptions) =>
          this.prepareMessages(inputMessages, backendConfig, imageOptions),
      },
    };
  }
}
