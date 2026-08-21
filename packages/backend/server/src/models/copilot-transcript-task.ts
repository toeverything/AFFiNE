import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Prisma as PrismaClient } from '@prisma/client';

import { BaseModel } from './base';

function nullableJson(
  value: unknown
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return value === undefined
    ? PrismaClient.JsonNull
    : (value as Prisma.InputJsonValue);
}

function isRecordNotFound(error: unknown) {
  return (
    error instanceof PrismaClient.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}

@Injectable()
export class CopilotTranscriptTaskModel extends BaseModel {
  async create(
    input: Pick<
      Prisma.AiTranscriptTaskCreateArgs['data'],
      'userId' | 'workspaceId' | 'blobId' | 'recipeId' | 'recipeVersion'
    > &
      Partial<Prisma.AiTranscriptTaskCreateArgs['data']>
  ) {
    return await this.db.aiTranscriptTask.create({
      data: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        blobId: input.blobId,
        status: 'pending',
        recipeId: input.recipeId,
        recipeVersion: input.recipeVersion,
        dispatchGeneration: input.dispatchGeneration ?? null,
        inputSnapshot: nullableJson(input.inputSnapshot),
        publicMeta: nullableJson(input.publicMeta),
        protectedResult: nullableJson(input.protectedResult),
      },
    });
  }

  async get(id: string) {
    const row = await this.db.aiTranscriptTask.findUnique({ where: { id } });
    return row ?? null;
  }

  async getWithUser(
    userId: string,
    workspaceId: string,
    taskId?: string,
    blobId?: string
  ) {
    if (!taskId && !blobId) return null;
    const row = await this.db.aiTranscriptTask.findFirst({
      where: {
        userId,
        workspaceId,
        ...(taskId ? { id: taskId } : {}),
        ...(blobId ? { blobId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return row ?? null;
  }

  async markRunning(id: string, actionRunId?: string | null) {
    try {
      return await this.db.aiTranscriptTask.update({
        where: { id },
        data: {
          status: 'running',
          ...(actionRunId ? { actionRunId } : {}),
          errorCode: null,
        },
      });
    } catch (error) {
      if (isRecordNotFound(error)) return null;
      throw error;
    }
  }

  async claimRetry(
    id: string,
    userId: string,
    workspaceId: string,
    actionRunId: string | null,
    dispatchGeneration: string
  ) {
    const { count } = await this.db.aiTranscriptTask.updateMany({
      where: {
        id,
        userId,
        workspaceId,
        status: 'failed',
        actionRunId,
      },
      data: {
        status: 'pending',
        dispatchGeneration,
        errorCode: null,
      },
    });
    return count === 1;
  }

  async claimDispatch(
    id: string,
    dispatchGeneration: string,
    actionRunId: string | null
  ) {
    const { count } = await this.db.aiTranscriptTask.updateMany({
      where: {
        id,
        status: 'pending',
        dispatchGeneration,
        actionRunId,
      },
      data: { status: 'running', errorCode: null },
    });
    return count === 1;
  }

  async attachActionRun(
    id: string,
    dispatchGeneration: string,
    actionRunId: string | null,
    nextActionRunId: string
  ) {
    const { count } = await this.db.aiTranscriptTask.updateMany({
      where: {
        id,
        status: 'running',
        dispatchGeneration,
        actionRunId,
      },
      data: { actionRunId: nextActionRunId },
    });
    return count === 1;
  }

  async completeDispatch(
    id: string,
    dispatchGeneration: string,
    actionRunId: string | null,
    input: Prisma.AiTranscriptTaskUpdateArgs['data']
  ) {
    const { count } = await this.db.aiTranscriptTask.updateMany({
      where: {
        id,
        status: 'running',
        dispatchGeneration,
        actionRunId,
      },
      data: {
        status: input.status,
        dispatchGeneration: null,
        publicMeta: nullableJson(input.publicMeta),
        protectedResult: nullableJson(input.protectedResult),
        errorCode: input.errorCode ?? null,
      },
    });
    return count === 1;
  }

  async failPendingDispatch(
    id: string,
    dispatchGeneration: string,
    errorCode: string
  ) {
    const { count } = await this.db.aiTranscriptTask.updateMany({
      where: { id, status: 'pending', dispatchGeneration },
      data: {
        status: 'failed',
        dispatchGeneration: null,
        errorCode,
      },
    });
    return count === 1;
  }

  async pendingDispatches(before: Date, take = 100) {
    return await this.db.aiTranscriptTask.findMany({
      where: {
        status: 'pending',
        dispatchGeneration: { not: null },
        updatedAt: { lt: before },
      },
      orderBy: { updatedAt: 'asc' },
      take,
    });
  }

  async staleRunningDispatches(before: Date, take = 100) {
    return await this.db.aiTranscriptTask.findMany({
      where: {
        status: 'running',
        dispatchGeneration: { not: null },
        updatedAt: { lt: before },
      },
      orderBy: { updatedAt: 'asc' },
      take,
    });
  }

  async failRunningDispatch(
    id: string,
    dispatchGeneration: string,
    errorCode: string
  ) {
    const { count } = await this.db.aiTranscriptTask.updateMany({
      where: { id, status: 'running', dispatchGeneration },
      data: {
        status: 'failed',
        dispatchGeneration: null,
        errorCode,
      },
    });
    return count === 1;
  }

  async complete(id: string, input: Prisma.AiTranscriptTaskUpdateArgs['data']) {
    try {
      return await this.db.aiTranscriptTask.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.actionRunId ? { actionRunId: input.actionRunId } : {}),
          publicMeta: nullableJson(input.publicMeta),
          protectedResult: nullableJson(input.protectedResult),
          errorCode: input.errorCode ?? null,
        },
      });
    } catch (error) {
      if (isRecordNotFound(error)) return null;
      throw error;
    }
  }

  async settle(id: string) {
    const task = await this.get(id);
    if (!task) return null;

    return await this.db.aiTranscriptTask.update({
      where: { id },
      data: { status: 'settled', settledAt: task.settledAt ?? new Date() },
    });
  }

  async countSettledByUser(userId: string) {
    return await this.db.aiTranscriptTask.count({
      where: { userId, status: 'settled' },
    });
  }
}
