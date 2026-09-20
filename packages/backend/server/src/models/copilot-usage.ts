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
  billingUnitId?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
};

type UsageAggregateRow = {
  date: string;
  featureKind: string;
  totalTokens: number | bigint | null;
};

type CountRow = {
  count: number | bigint;
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
        billingUnitId: input.billingUnitId,
        promptTokens: input.promptTokens ?? 0,
        completionTokens: input.completionTokens ?? 0,
        totalTokens: input.totalTokens ?? 0,
        cachedTokens: input.cachedTokens ?? 0,
      },
    });
  }

  async countQuotaExemptByokUsage(userId: string) {
    const rows = await this.db.$queryRaw<CountRow[]>(Prisma.sql`
      WITH "byok_usage" AS (
        SELECT "billing_unit_id", "feature_kind"
        FROM "ai_usage_events"
        WHERE "user_id" = ${userId}
          AND "provider_source" IN (${Prisma.join(BYOK_PROVIDER_SOURCES)})
          AND "feature_kind" IN (${Prisma.join(QUOTA_EXEMPT_BYOK_FEATURES)})
          AND "billing_unit_id" IS NOT NULL
      ),
      "message_units" AS (
        SELECT DISTINCT "usage"."billing_unit_id"
        FROM "byok_usage" AS "usage"
        JOIN "ai_sessions_messages" AS "message"
          ON "message"."id" = "usage"."billing_unit_id"
        JOIN "ai_sessions_metadata" AS "session"
          ON "session"."id" = "message"."session_id"
        WHERE "usage"."feature_kind" IN ('chat', 'action', 'image')
          AND "message"."role" = 'user'
          AND "session"."user_id" = ${userId}
          AND ("session"."prompt_action" IS NULL OR "session"."prompt_action" = '')
      ),
      "action_units" AS (
        SELECT DISTINCT "usage"."billing_unit_id"
        FROM "byok_usage" AS "usage"
        JOIN "ai_action_runs" AS "run"
          ON "run"."id" = "usage"."billing_unit_id"
        WHERE "usage"."feature_kind" IN ('action', 'image')
          AND "run"."user_id" = ${userId}
          AND "run"."status" = 'succeeded'
          AND "run"."action_id" NOT LIKE 'transcript.audio.%'
      ),
      "transcript_units" AS (
        SELECT DISTINCT "usage"."billing_unit_id"
        FROM "byok_usage" AS "usage"
        JOIN "ai_transcript_tasks" AS "task"
          ON "task"."id" = "usage"."billing_unit_id"
        WHERE "usage"."feature_kind" = 'transcript'
          AND "task"."user_id" = ${userId}
          AND "task"."status" = 'settled'
      )
      SELECT (
        (SELECT COUNT(*) FROM "message_units") +
        (SELECT COUNT(*) FROM "action_units") +
        (SELECT COUNT(*) FROM "transcript_units")
      ) AS "count"
    `);
    const count = rows[0]?.count ?? 0;
    return typeof count === 'bigint' ? Number(count) : count;
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
        to_char(date_trunc('day', "created_at" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS "date",
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
      return {
        date: new Date(`${row.date}T00:00:00.000Z`),
        featureKind: row.featureKind,
        totalTokens: Number(row.totalTokens ?? 0),
      };
    });
  }
}
