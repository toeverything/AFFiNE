/* oxlint-disable import/no-cycle -- Tool callbacks can invoke nested Copilot prompts. */
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { Config } from '../../../base/config';
import { CopilotPromptInvalid } from '../../../base/error/errors.gen';
import { BackendRuntimeProvider } from '../../../core/backend-runtime';
import {
  buildLlmEmbeddingRequest,
  buildLlmImageRequestFromMessages,
  buildLlmRerankRequest,
  type LlmImageResponse,
  type LlmToolCallbackRequest,
  type LlmToolLoopStreamEvent,
  llmValidateJsonSchema,
} from '../../../native';
import {
  getByokSourceCoverage,
  getCopilotFeatureAccess,
} from '../access/feature-coverage';
import { assertCopilotEnabled } from '../availability';
import { ByokEntitlementPolicy } from '../byok/policy';
import type { ByokFeatureKind } from '../byok/types';
import { ConversationPolicy } from '../conversation/policy';
import { ValidatedStructuredValueSchema } from '../core/types';
import {
  type CopilotChatOptions,
  type CopilotEmbeddingOptions,
  type CopilotImageOptions,
  type CopilotProviderType,
  type CopilotRerankRequest,
  type CopilotStructuredOptions,
  type ModelAttachmentCapability,
  type ModelConditions,
  type PromptMessage,
  type StreamObject,
} from '../providers/types';
import {
  buildToolContracts,
  type RequiredStructuredOutputContract,
  requireStructuredOutputContract,
} from './contracts';
import {
  type CopilotRuntimeEvent,
  CopilotRuntimeEventConsumer,
} from './copilot-runtime-event-consumer';
import { mapNativeSemanticError } from './native-errors';
import {
  buildCanonicalNativeRequest,
  buildCanonicalNativeStructuredRequest,
  preparePromptMessagesForNativeRequest,
} from './native-request-runtime';
import { executeToolCall } from './tool/bridge';
import { NativeProviderAdapter } from './tool/native-adapter';
import { ToolRuntime } from './tool-runtime';

type ProviderFilter = { prefer?: CopilotProviderType };
type RuntimeOptions = NonNullable<CopilotChatOptions> & {
  dimensions?: number;
  responseSchemaJson?: Record<string, unknown>;
  schemaHash?: string;
  strict?: boolean;
  profileId?: string;
};

export type NativeImageArtifact = LlmImageResponse['images'][number];

const attachmentCapability = {
  kinds: ['image', 'audio', 'file'],
  sourceKinds: ['url', 'data', 'bytes', 'file_handle'],
  allowRemoteUrls: true,
} satisfies ModelAttachmentCapability;

@Injectable()
export class CapabilityRuntime {
  constructor(
    private readonly backend: BackendRuntimeProvider,
    private readonly entitlement: ByokEntitlementPolicy,
    private readonly conversations: ConversationPolicy,
    private readonly tools: ToolRuntime,
    private readonly events: CopilotRuntimeEventConsumer,
    private readonly config: Config
  ) {}

  private async access(options: RuntimeOptions) {
    assertCopilotEnabled(this.config);
    const workspaceId = options.workspace;
    const featureKind = (options.featureKind ?? 'chat') as ByokFeatureKind;
    const coverage = getByokSourceCoverage(featureKind);
    const [serverByok, localByok, premium] = workspaceId
      ? await Promise.all([
          coverage.server && this.entitlement.hasServerEntitlement(workspaceId),
          coverage.local &&
            this.entitlement.hasLocalEntitlement(workspaceId, options.user),
          this.entitlement.hasAiPlan(options.user),
        ])
      : [false, false, await this.entitlement.hasAiPlan(options.user)];
    const routeAllowed =
      options.quotaBackedRoutesAllowed ??
      (!getCopilotFeatureAccess(featureKind).quotaMetered ||
        !options.user ||
        (await this.conversations.hasQuota(options.user)));
    return {
      routeAllowed,
      managedTier: premium ? ('Premium' as const) : ('Standard' as const),
      serverByok,
      localByok,
    };
  }

  private eventContext(options: RuntimeOptions) {
    return {
      workspaceId: options.workspace,
      userId: options.user,
      sessionId: options.session,
      taskId: options.taskId,
      actionId: options.actionId,
      billingUnitId: options.billingUnitId,
      featureKind: (options.featureKind ?? 'chat') as ByokFeatureKind,
    };
  }

  private targetOverride(cond: ModelConditions) {
    return cond.profileId && cond.modelId
      ? { profileId: cond.profileId, modelId: cond.modelId }
      : undefined;
  }

  async assertRoute(
    slot: string,
    cond: ModelConditions,
    options: CopilotChatOptions = {}
  ) {
    try {
      await this.backend.assertCopilotRoute({
        slot,
        builtInRouteId: options.builtInRouteId,
        workspaceId: options.workspace,
        userId: options.user,
        localLeaseId: options.byokLeaseId,
        access: await this.access(options),
        managedTargetId: options.managedTargetId,
        targetOverride: this.targetOverride(cond),
      });
    } catch (error) {
      throw mapNativeSemanticError(error);
    }
  }

  private async execute(
    slot: string,
    request: unknown,
    cond: ModelConditions,
    options: RuntimeOptions
  ) {
    try {
      const output = await this.backend.executeCopilot({
        slot,
        builtInRouteId: options.builtInRouteId,
        workspaceId: options.workspace,
        userId: options.user,
        localLeaseId: options.byokLeaseId,
        access: await this.access(options),
        managedTargetId: options.managedTargetId,
        targetOverride: this.targetOverride(cond),
        request,
      });
      await this.events.consume(
        output.events as CopilotRuntimeEvent[],
        this.eventContext(options)
      );
      return output.result;
    } catch (error) {
      throw mapNativeSemanticError(error);
    }
  }

  private async prepareChat(
    messages: PromptMessage[],
    options: RuntimeOptions
  ) {
    const toolSet = await this.tools.getTools(options, '');
    const { request } = await buildCanonicalNativeRequest({
      model: 'route-selected',
      messages,
      options,
      toolContracts: buildToolContracts(toolSet),
      attachmentCapability,
      include: options.reasoning ? ['reasoning'] : undefined,
      reasoning: options.reasoning ? { effort: 'medium' } : undefined,
    });
    return { request: { ...request, stream: true }, toolSet };
  }

  private async stream(
    slot: string,
    cond: ModelConditions,
    messages: PromptMessage[],
    options: RuntimeOptions
  ) {
    const { request, toolSet } = await this.prepareChat(messages, options);
    const runId = randomUUID();
    const rawStream = this.backend.streamCopilot<
      LlmToolLoopStreamEvent | CopilotRuntimeEvent
    >(
      {
        slot,
        builtInRouteId: options.builtInRouteId,
        workspaceId: options.workspace,
        userId: options.user,
        localLeaseId: options.byokLeaseId,
        access: await this.access(options),
        managedTargetId: options.managedTargetId,
        targetOverride: this.targetOverride(cond),
        request,
      },
      async requestJson => {
        const toolRequest = JSON.parse(requestJson) as LlmToolCallbackRequest;
        return JSON.stringify(
          await executeToolCall(toolSet, toolRequest, {
            signal: options.signal,
            messages,
            runId,
            toolCallId: toolRequest.callId,
          })
        );
      },
      { maxSteps: 20, signal: options.signal }
    );
    const runtimeEvents = this.events;
    const eventContext = this.eventContext(options);
    async function* productEvents() {
      for await (const event of rawStream) {
        if ('route' in event) {
          await runtimeEvents.consume([event], eventContext);
        } else if (event.type === 'error') {
          throw mapNativeSemanticError(
            new Error(
              typeof event.message === 'string'
                ? event.message
                : 'native runtime stream error'
            )
          );
        } else {
          yield event;
        }
      }
    }
    return { request, stream: productEvents() };
  }

  async text(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {},
    _filter?: ProviderFilter
  ) {
    const prepared = await this.stream('prompt.text', cond, messages, options);
    return await new NativeProviderAdapter(() => prepared.stream).text(
      prepared.request,
      options.signal,
      messages
    );
  }

  async *streamText(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {},
    _filter?: ProviderFilter
  ): AsyncIterableIterator<string> {
    const prepared = await this.stream('chat.default', cond, messages, options);
    yield* new NativeProviderAdapter(() => prepared.stream).streamText(
      prepared.request,
      options.signal,
      messages
    );
  }

  async *streamObject(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {},
    _filter?: ProviderFilter
  ): AsyncIterableIterator<StreamObject> {
    const prepared = await this.stream('chat.default', cond, messages, options);
    yield* new NativeProviderAdapter(() => prepared.stream).streamObject(
      prepared.request,
      options.signal,
      messages
    );
  }

  async generateStructured(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotStructuredOptions = {},
    _filter?: ProviderFilter,
    responseContract?: RequiredStructuredOutputContract,
    slot = 'prompt.structured'
  ) {
    const contract = requireStructuredOutputContract(responseContract);
    if (!contract) {
      throw new CopilotPromptInvalid('Structured schema contract is required');
    }
    const { request } = await buildCanonicalNativeStructuredRequest({
      model: 'route-selected',
      messages,
      options,
      responseContract: contract,
      attachmentCapability,
    });
    const result = (await this.execute(slot, request, cond, options)) as {
      output_json?: unknown;
      output_text: string;
    };
    if (result.output_json === undefined) {
      throw new CopilotPromptInvalid(
        'Structured response is missing output_json'
      );
    }
    return JSON.stringify(
      llmValidateJsonSchema(request.schema, result.output_json)
    );
  }

  async generateStructuredValue(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotStructuredOptions,
    responseContract?: RequiredStructuredOutputContract,
    filter?: ProviderFilter,
    slot = 'prompt.structured'
  ) {
    const contract = requireStructuredOutputContract(responseContract);
    if (!contract) {
      throw new CopilotPromptInvalid('Structured schema contract is required');
    }
    const value = JSON.parse(
      await this.generateStructured(
        cond,
        messages,
        options,
        filter,
        contract,
        slot
      )
    );
    return ValidatedStructuredValueSchema.parse({
      value,
      schemaHash: contract.schemaHash,
      schemaValidationVersion: 'json-schema-v1',
      provider: 'auto',
      model: 'route-selected',
    });
  }

  async embeddingConfigured(_modelId: string) {
    return this.config.copilot.enabled;
  }

  async embed(
    _modelId: string,
    input: string | string[],
    options: CopilotEmbeddingOptions = {}
  ) {
    const result = (await this.execute(
      'index.embedding',
      buildLlmEmbeddingRequest({
        model: 'route-selected',
        inputs: Array.isArray(input) ? input : [input],
        dimensions: options.dimensions,
      }),
      {},
      options
    )) as { embeddings: number[][] };
    return result.embeddings;
  }

  async rerankConfigured(_modelId: string) {
    return this.config.copilot.enabled;
  }

  async rerank(
    _modelId: string,
    request: CopilotRerankRequest,
    options: CopilotChatOptions = {}
  ) {
    const result = (await this.execute(
      'search.rerank',
      buildLlmRerankRequest('route-selected', request),
      {},
      options
    )) as { scores: number[] };
    return result.scores;
  }

  async *streamImageArtifacts(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotImageOptions = {},
    _filter?: ProviderFilter,
    slot = 'image.generate'
  ): AsyncIterableIterator<NativeImageArtifact> {
    const { quality, seed, modelName, loras } = options;
    const result = (await this.execute(
      slot,
      buildLlmImageRequestFromMessages({
        model: 'route-selected',
        messages: preparePromptMessagesForNativeRequest(messages, true),
        options: { quality, seed, modelName, loras },
      }),
      cond,
      options
    )) as LlmImageResponse;
    yield* result.images;
  }
}
