import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';

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

type UsageAggregateRow = {
  date: Date | string;
  featureKind: string;
  totalTokens: number | bigint | null;
};

const BYOK_PROVIDER_SOURCES = ['byok_server', 'byok_local'];
const QUOTA_EXEMPT_BYOK_FEATURES = ['chat', 'action', 'image', 'transcript'];

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

  async countQuotaExemptByokUsage(userId: string) {
    return await this.db.aiUsageEvent.count({
      where: {
        userId,
        providerSource: { in: BYOK_PROVIDER_SOURCES },
        featureKind: { in: QUOTA_EXEMPT_BYOK_FEATURES },
      },
    });
  }

  async aggregateByDay(input: {
    workspaceId: string;
    from: Date;
    to: Date;
    providerSources: string[];
  }) {
    if (!input.providerSources.length) return [];

    const rows = await this.db.$queryRaw<UsageAggregateRow[]>(Prisma.sql`
      SELECT
        date_trunc('day', "created_at" AT TIME ZONE 'UTC')::date AS "date",
        "feature_kind" AS "featureKind",
        COALESCE(SUM("total_tokens"), 0)::bigint AS "totalTokens"
      FROM "ai_usage_events"
      WHERE "workspace_id" = ${input.workspaceId}
        AND "provider_source" IN (${Prisma.join(input.providerSources)})
        AND "created_at" >= ${input.from}
        AND "created_at" < ${input.to}
      GROUP BY 1, 2
      ORDER BY 1 ASC, 2 ASC
    `);

    return rows.map(row => {
      const day =
        row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : row.date;
      return {
        date: new Date(`${day}T00:00:00.000Z`),
        featureKind: row.featureKind,
        totalTokens: Number(row.totalTokens ?? 0),
      };
    });
  }
}
