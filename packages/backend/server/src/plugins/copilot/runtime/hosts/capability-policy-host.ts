import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { ServerFeature, ServerService } from '../../../../core';
import { QuotaStateService } from '../../../../core/quota/state';
import type { ChatSession } from '../../session';
import { type ToolsConfig } from '../../types';
import { getTools } from '../../utils';
import {
  ModelSelectionPolicy,
  type ResolveModelInput,
} from '../model-selection-policy';

export type ChatSelectionOptions = {
  responseMode: 'text' | 'object' | 'image';
  modelId?: string;
  reasoning?: boolean;
  webSearch?: boolean;
  toolsConfig?: ToolsConfig;
  byokLeaseId?: string;
  billingUnitId?: string;
  featureKind?: 'chat' | 'action' | 'image';
  quotaBackedRoutesAllowed?: boolean;
};

type ResolvePolicyModelInput = ResolveModelInput & {
  proModels?: string[] | null;
  userId?: string;
  paymentEnabled?: boolean;
};

@Injectable()
export class CapabilityPolicyHost {
  constructor(
    private readonly server: ServerService,
    private readonly moduleRef: ModuleRef,
    private readonly modelSelection: ModelSelectionPolicy
  ) {}

  private async hasAiProAccess(
    userId: string | undefined,
    paymentEnabled: boolean | undefined
  ) {
    if (!paymentEnabled || !userId) {
      return false;
    }

    try {
      const state = await this.moduleRef
        .get(QuotaStateService, { strict: false })
        .reconcileUserQuotaState(userId);
      const flags = state.flags as { unlimitedCopilot?: boolean };
      return (
        !!flags.unlimitedCopilot ||
        ['pro', 'lifetime_pro', 'ai'].includes(state.plan)
      );
    } catch {
      return false;
    }
  }

  private async resolveModel(input: ResolvePolicyModelInput) {
    const resolved = this.modelSelection.resolveRequestedModel(input);
    if (!resolved.matchedOptionalModel) {
      return resolved.selectedModel;
    }

    if (
      input.paymentEnabled &&
      this.modelSelection.matchesModelList(
        input.proModels ?? [],
        input.requestedModelId
      ) &&
      !(await this.hasAiProAccess(input.userId, input.paymentEnabled))
    ) {
      return input.defaultModel;
    }

    return resolved.selectedModel;
  }

  async selectChat(session: ChatSession, options: ChatSelectionOptions) {
    const model = await this.resolveChatModel({
      userId: session.config.userId,
      defaultModel: session.model,
      optionalModels: session.optionalModels,
      proModels: session.config.promptConfig?.proModels,
      requestedModelId: options.modelId,
      paymentEnabled: this.server.features.includes(ServerFeature.Payment),
    });
    const tools = getTools(
      session.config.promptConfig?.tools,
      options.toolsConfig
    );
    return {
      model,
      providerOptions: {
        ...session.config.promptConfig,
        user: session.config.userId,
        session: session.config.sessionId,
        workspace: session.config.workspaceId,
        byokLeaseId: options.byokLeaseId,
        billingUnitId: options.billingUnitId,
        featureKind: options.featureKind ?? 'chat',
        quotaBackedRoutesAllowed: options.quotaBackedRoutesAllowed,
        reasoning: options.reasoning,
        webSearch: options.webSearch,
        tools,
      },
    };
  }

  async resolveChatModel(input: ResolvePolicyModelInput) {
    return await this.resolveModel(input);
  }

  async resolvePromptModel(input: ResolveModelInput) {
    return this.modelSelection.resolveRequestedModel(input).selectedModel;
  }

  async resolveFixedTaskModel(input: ResolveModelInput) {
    return this.modelSelection.resolveRequestedModel(input).selectedModel;
  }
}
