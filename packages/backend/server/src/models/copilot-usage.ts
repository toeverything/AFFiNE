import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';

import { BaseModel } from './base';

type CreateAiUsageEventInput = {
  workspaceId: string;
  userId?: string;
  provider: string;
  providerSource: string;
  featureKind: string;
  model?: string | null;
  sessionId?: string;
  taskId?: string;
  actionId?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
};

@Injectable()
export class CopilotUsageModel extends BaseModel {
  @Transactional()
  async create(input: CreateAiUsageEventInput) {
    await this.db.aiUsageEvent.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        provider: input.provider,
        providerSource: input.providerSource,
        featureKind: input.featureKind,
        model: input.model ?? null,
        sessionId: input.sessionId,
        taskId: input.taskId,
        actionId: input.actionId,
        promptTokens: input.promptTokens ?? 0,
        completionTokens: input.completionTokens ?? 0,
        totalTokens: input.totalTokens ?? 0,
        cachedTokens: input.cachedTokens ?? 0,
      },
    });
  }

  async aggregateByDay(input: {
    workspaceId: string;
    from: Date;
    to: Date;
    providerSources: string[];
  }) {
    const rows = await this.db.aiUsageEvent.groupBy({
      by: ['featureKind', 'createdAt'],
      where: {
        workspaceId: input.workspaceId,
        providerSource: { in: input.providerSources },
        createdAt: { gte: input.from, lt: input.to },
      },
      _sum: { totalTokens: true },
    });

    const totals = new Map<string, number>();
    for (const row of rows) {
      const day = row.createdAt.toISOString().slice(0, 10);
      const key = `${day}:${row.featureKind}`;
      totals.set(key, (totals.get(key) ?? 0) + (row._sum.totalTokens ?? 0));
    }

    return Array.from(totals.entries())
      .map(([key, totalTokens]) => {
        const [day, featureKind] = key.split(':');
        return {
          date: new Date(`${day}T00:00:00.000Z`),
          featureKind,
          totalTokens,
        };
      })
      .toSorted((a, b) => a.date.getTime() - b.date.getTime());
  }
}
