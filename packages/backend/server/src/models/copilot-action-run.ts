import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Prisma as PrismaClient } from '@prisma/client';

import { BaseModel } from './base';

export type AiActionRunStatus =
  | 'created'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'aborted';

function nullableJson(
  value: unknown
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return value === undefined
    ? PrismaClient.JsonNull
    : (value as Prisma.InputJsonValue);
}

@Injectable()
export class CopilotActionRunModel extends BaseModel {
  async create(
    input: Pick<
      Prisma.AiActionRunCreateArgs['data'],
      'userId' | 'workspaceId' | 'actionId' | 'actionVersion'
    > & { inputSnapshot?: unknown } & Omit<
        Partial<Prisma.AiActionRunCreateArgs['data']>,
        'inputSnapshot'
      >
  ) {
    return await this.db.aiActionRun.create({
      data: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        docId: input.docId ?? null,
        sessionId: input.sessionId ?? null,
        userMessageId: input.userMessageId ?? null,
        compatSubmissionId: input.compatSubmissionId ?? null,
        actionId: input.actionId,
        actionVersion: input.actionVersion,
        status: 'created',
        attempt: input.attempt ?? 1,
        retryOf: input.retryOf ?? null,
        inputSnapshot: nullableJson(input.inputSnapshot),
      },
    });
  }

  async markRunning(id: string) {
    return await this.db.aiActionRun.update({
      where: { id },
      data: { status: 'running' },
    });
  }

  async complete(
    id: string,
    input: Omit<
      Prisma.AiActionRunUpdateArgs['data'],
      'artifacts' | 'result' | 'trace'
    > & {
      result?: unknown;
      artifacts?: unknown;
      trace?: unknown;
    }
  ) {
    return await this.db.aiActionRun.update({
      where: { id },
      data: {
        status: input.status,
        result: nullableJson(input.result),
        artifacts: nullableJson(input.artifacts),
        resultSummary: input.resultSummary ?? null,
        errorCode: input.errorCode ?? null,
        trace: nullableJson(input.trace),
        assistantMessageId: input.assistantMessageId ?? null,
      },
    });
  }

  async get(id: string) {
    const row = await this.db.aiActionRun.findUnique({ where: { id } });
    return row ?? null;
  }

  async countSucceededByUser(userId: string) {
    return await this.db.aiActionRun.count({
      where: {
        userId,
        status: 'succeeded',
        NOT: {
          actionId: {
            startsWith: 'transcript.audio.',
          },
        },
      },
    });
  }

  async countLegacyPromptActionSessionsWithoutRun(userId: string) {
    return await this.db.aiSession.count({
      where: {
        userId,
        promptAction: {
          not: null,
        },
        NOT: {
          promptAction: '',
        },
        actionRuns: {
          none: {},
        },
      },
    });
  }
}
