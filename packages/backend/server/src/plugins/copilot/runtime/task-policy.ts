import { Injectable } from '@nestjs/common';

import { Models } from '../../../models';
import { PromptService } from '../prompt/service';

export const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';
export const DEFAULT_RERANK_MODEL = 'gpt-4o-mini';

@Injectable()
export class TaskPolicy {
  constructor(
    private readonly models: Models,
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

    const hasAccess = await this.models.userFeature.has(
      userId,
      'unlimited_copilot'
    );
    return prompt.optionalModels[hasAccess ? 1 : 0] ?? prompt.model;
  }
}
