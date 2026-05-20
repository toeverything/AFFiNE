import { Injectable } from '@nestjs/common';

import { CopilotPromptInvalid } from '../../../base';
import { ValidatedStructuredValueSchema } from '../core';
import {
  type CopilotChatOptions,
  type CopilotEmbeddingOptions,
  type CopilotImageOptions,
  type CopilotProviderType,
  type CopilotRerankRequest,
  type CopilotStructuredOptions,
  type ModelConditions,
  type PromptMessage,
  type StreamObject,
} from '../providers/types';
import {
  type RequiredStructuredOutputContract,
  requireStructuredOutputContract,
} from './contracts';
import {
  ExecutionPlanBuilder,
  type ExecutionPlanForKind,
} from './execution-plan';
import {
  NativeExecutionEngine,
  type NativeImageArtifact,
} from './native-execution-engine';

type ProviderFilter = {
  prefer?: CopilotProviderType;
};

const providerModelId = (modelId?: string) => modelId ?? 'auto';

@Injectable()
export class CapabilityRuntime {
  constructor(
    private readonly plans: ExecutionPlanBuilder,
    private readonly engine: NativeExecutionEngine
  ) {}

  private async executePlan<TPlan, TResult>(
    build: () => Promise<TPlan>,
    execute: (plan: TPlan) => Promise<TResult>
  ) {
    return await execute(await build());
  }

  private executeStreamPlan<TPlan, TChunk>(
    build: () => Promise<TPlan>,
    execute: (plan: TPlan) => AsyncIterableIterator<TChunk>
  ): AsyncIterableIterator<TChunk> {
    return (async function* () {
      yield* execute(await build());
    })();
  }

  private hasNativeDispatch(
    plan: ExecutionPlanForKind<'embedding'> | ExecutionPlanForKind<'rerank'>,
    kind: 'embedding' | 'rerank'
  ) {
    return !!plan.nativeDispatch?.[kind];
  }

  async text(
    cond: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions,
    filter?: ProviderFilter
  ) {
    return await this.executePlan(
      () => this.plans.buildTextPlan(cond, messages, options, filter),
      plan => this.engine.execute(plan)
    );
  }

  async *streamText(
    cond: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions,
    filter?: ProviderFilter
  ): AsyncIterableIterator<string> {
    yield* this.executeStreamPlan(
      () => this.plans.buildStreamTextPlan(cond, messages, options, filter),
      plan => this.engine.executeStream(plan)
    );
  }

  async *streamObject(
    cond: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions,
    filter?: ProviderFilter
  ): AsyncIterableIterator<StreamObject> {
    yield* this.executeStreamPlan(
      () => this.plans.buildStreamObjectPlan(cond, messages, options, filter),
      plan => this.engine.executeStream(plan)
    );
  }

  async generateStructured(
    cond: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotStructuredOptions,
    filter?: ProviderFilter,
    responseContract?: RequiredStructuredOutputContract
  ) {
    return await this.executePlan(
      () =>
        this.plans.buildStructuredPlan(
          cond,
          messages,
          options,
          filter,
          responseContract
        ),
      plan => this.engine.execute(plan)
    );
  }

  async generateStructuredValue(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotStructuredOptions,
    responseContract?: RequiredStructuredOutputContract,
    filter?: ProviderFilter
  ) {
    const validatedResponseContract =
      requireStructuredOutputContract(responseContract);
    if (!options || !validatedResponseContract) {
      throw new CopilotPromptInvalid('Structured schema contract is required');
    }

    const output = await this.generateStructured(
      cond,
      messages,
      options,
      filter,
      validatedResponseContract
    );
    const value = JSON.parse(output);
    return ValidatedStructuredValueSchema.parse({
      value,
      schemaHash: validatedResponseContract.schemaHash,
      schemaValidationVersion: 'json-schema-v1',
      provider: filter?.prefer ?? 'auto',
      model: providerModelId(cond.modelId),
    });
  }

  async embeddingConfigured(modelId: string) {
    try {
      return this.hasNativeDispatch(
        await this.plans.buildEmbeddingPlan(modelId, 'ping'),
        'embedding'
      );
    } catch {
      return false;
    }
  }

  async embed(
    modelId: string,
    input: string | string[],
    options?: CopilotEmbeddingOptions
  ) {
    return await this.executePlan(
      () => this.plans.buildEmbeddingPlan(modelId, input, options),
      plan => this.engine.execute(plan)
    );
  }

  async rerankConfigured(modelId: string) {
    try {
      return this.hasNativeDispatch(
        await this.plans.buildRerankPlan(modelId, {
          query: 'ping',
          candidates: [{ text: 'ping' }],
        }),
        'rerank'
      );
    } catch {
      return false;
    }
  }

  async rerank(
    modelId: string,
    request: CopilotRerankRequest,
    options?: CopilotChatOptions
  ) {
    return await this.executePlan(
      () => this.plans.buildRerankPlan(modelId, request, options),
      plan => this.engine.execute(plan)
    );
  }

  async *streamImageArtifacts(
    cond: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotImageOptions,
    filter?: ProviderFilter
  ): AsyncIterableIterator<NativeImageArtifact> {
    yield* this.executeStreamPlan(
      () => this.plans.buildImagePlan(cond, messages, options, filter),
      plan => this.engine.executeImageArtifacts(plan)
    );
  }
}
