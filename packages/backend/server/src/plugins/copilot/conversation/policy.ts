import { Injectable } from '@nestjs/common';

import { CopilotQuotaExceeded } from '../../../base';
import { QuotaService } from '../../../core/quota/service';
import { Models } from '../../../models';
import type { Turn } from '../core';
import type { ResolvedPrompt } from '../prompt';

@Injectable()
export class ConversationPolicy {
  constructor(
    private readonly models: Models,
    private readonly quota: QuotaService
  ) {}

  async getQuota(userId: string) {
    const quota = await this.quota.getUserQuota(userId);
    const limit = quota.copilotActionLimit;

    const used = await this.models.copilotSession.countUserMessages(userId);

    return { limit, used };
  }

  async checkQuota(userId: string) {
    if (!(await this.hasQuota(userId))) {
      throw new CopilotQuotaExceeded();
    }
  }

  async hasQuota(userId: string) {
    const { limit, used } = await this.getQuota(userId);
    return !(limit !== undefined && Number.isFinite(limit) && used >= limit);
  }

  shouldScheduleTitle(prompt: Pick<ResolvedPrompt, 'action'>) {
    return !prompt.action;
  }

  shouldGenerateTitle(input: { title: string | null; turns: Turn[] }) {
    if (input.title || !input.turns.length) {
      return false;
    }

    let hasUser = false;
    let hasAssistant = false;
    for (const turn of input.turns) {
      if (turn.role === 'user') {
        hasUser = true;
      } else if (turn.role === 'assistant') {
        hasAssistant = true;
      }
      if (hasUser && hasAssistant) {
        return true;
      }
    }

    return false;
  }

  buildTitlePromptContent(turns: Turn[]) {
    return turns.map(turn => `[${turn.role}]: ${turn.content}`).join('\n');
  }
}
