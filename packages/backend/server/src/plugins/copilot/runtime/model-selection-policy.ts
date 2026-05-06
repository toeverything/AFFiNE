import { Injectable } from '@nestjs/common';

import { CopilotSessionInvalidInput } from '../../../base';
import { llmResolveRequestedModelMatch } from '../../../native';
import { CopilotProviderRegistryService } from '../providers/registry-service';

export type ResolveModelInput = {
  defaultModel: string;
  optionalModels?: string[] | null;
  requestedModelId?: string;
};

@Injectable()
export class ModelSelectionPolicy {
  constructor(private readonly registries: CopilotProviderRegistryService) {}

  private getRegistry() {
    return this.registries.getRegistry();
  }

  private matchRequestedModel(
    optionalModels: string[],
    requestedModelId?: string,
    defaultModel?: string
  ) {
    return llmResolveRequestedModelMatch({
      providerIds: [...this.getRegistry().profiles.keys()],
      optionalModels,
      requestedModelId,
      defaultModel,
    });
  }

  resolveRequestedModel(input: ResolveModelInput): {
    selectedModel: string;
    matchedOptionalModel: boolean;
  } {
    if (!input.defaultModel) {
      throw new CopilotSessionInvalidInput('Model is required');
    }
    const matched = this.matchRequestedModel(
      input.optionalModels ?? [],
      input.requestedModelId,
      input.defaultModel
    );
    return {
      selectedModel: matched.selectedModel ?? input.defaultModel,
      matchedOptionalModel: matched.matchedOptionalModel,
    };
  }

  matchesModelList(models: string[], modelId?: string) {
    return this.matchRequestedModel(models, modelId).matchedOptionalModel;
  }
}
