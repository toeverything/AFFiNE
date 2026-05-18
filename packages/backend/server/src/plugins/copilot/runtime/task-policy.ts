import { Injectable } from '@nestjs/common';

import { QuotaStateService } from '../../../core/quota/state';
import { PromptService } from '../prompt/service';

export const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';
export const DEFAULT_RERANK_MODEL = 'gpt-4o-mini';

@Injectable()
export class TaskPolicy {
  constructor(
    private readonly quotaState: QuotaStateService,
    private readonly prompts: PromptService
  ) {}

  resolveEmbeddingModelId() {
    return DEFAULT_EMBEDDING_MODEL;
  }

  resolveRerankModelId() {
    return DEFAULT_RERANK_MODEL;
  }

  async resolveTranscriptionModel(userId: string) {
    const prompt = await this.prompts.get('Transcript audio');
    if (!prompt) return;

    const state = await this.quotaState.reconcileUserQuotaState(userId);
    const flags = state.flags as { unlimitedCopilot?: boolean };
    const hasAccess =
      !!flags.unlimitedCopilot ||
      ['pro', 'lifetime_pro', 'ai'].includes(state.plan);
    return prompt.optionalModels[hasAccess ? 1 : 0] ?? prompt.model;
  }
}
