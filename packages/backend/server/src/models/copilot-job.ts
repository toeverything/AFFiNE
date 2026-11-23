import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { AiJobStatus, AiJobType } from '@prisma/client';
import type { ZodType } from 'zod';

import { BaseModel } from './base';
import { CopilotJob } from './common/copilot';

type CreateCopilotJobInput = Omit<CopilotJob, 'id' | 'status' | 'payload'>;
type UpdateCopilotJobInput = Pick<CopilotJob, 'status' | 'payload'>;

const FinishedStatus: Set<AiJobStatus> = new Set([
  AiJobStatus.finished,
  AiJobStatus.claimed,
]);

/**
 * Copilot Job Model
 */
@Injectable()
export class CopilotJobModel extends BaseModel {
  async create(job: CreateCopilotJobInput) {
    const row = await this.db.aiJobs.create({
      data: {
        workspaceId: job.workspaceId,
        blobId: job.blobId,
        createdBy: job.createdBy,
        type: job.type,
        status: AiJobStatus.pending,
        payload: {},
      },
      select: {
        id: true,
        status: true,
      },
    });
    return row;
  }

  async has(userId: string, workspaceId: string, blobId: string) {
    const row = await this.db.aiJobs.findFirst({
      where: {
        createdBy: userId,
        workspaceId,
        blobId,
      },
    });
    return !!row;
  }

  async getWithUser(
    userId: string,
    workspaceId: string,
    jobId?: string,
    blobId?: string,
    type?: AiJobType
  ) {
    if (!jobId && !blobId) {
      return null;
    }

    const row = await this.db.aiJobs.findFirst({
      where: {
        id: jobId,
        blobId,
        workspaceId,
        type,
        OR: [
          { createdBy: userId },
          { createdBy: { not: userId }, status: AiJobStatus.claimed },
        ],
      },
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      workspaceId: row.workspaceId,
      blobId: row.blobId,
      createdBy: row.createdBy || undefined,
      type: row.type,
      status: row.status,
      payload: row.payload,
    };
  }

  async update(jobId: string, data: UpdateCopilotJobInput) {
    const ret = await this.db.aiJobs.updateMany({
      where: {
        id: jobId,
      },
      data: {
        status: data.status || undefined,
        payload: data.payload || undefined,
        finishedAt:
          data.status && FinishedStatus.has(data.status)
            ? new Date()
            : undefined,
      },
    });
    return ret.count > 0;
  }

  @Transactional()
  async claim(jobId: string, userId: string) {
    const job = await this.get(jobId);

    if (
      job &&
      job.createdBy === userId &&
      job.status === AiJobStatus.finished
    ) {
      await this.update(jobId, { status: AiJobStatus.claimed });
    }

    const ret = await this.db.aiJobs.findFirst({
      where: { id: jobId },
      select: { status: true },
    });
    return ret?.status;
  }

  async get(jobId: string): Promise<CopilotJob | null> {
    const row = await this.db.aiJobs.findFirst({
      where: {
        id: jobId,
      },
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      workspaceId: row.workspaceId,
      blobId: row.blobId,
      createdBy: row.createdBy || undefined,
      type: row.type,
      status: row.status,
      payload: row.payload,
    };
  }

  async getPayload<
    C extends ZodType<any>,
    O = C extends ZodType<infer T> ? T : never,
  >(jobId: string, schema: C): Promise<O> {
    const row = await this.db.aiJobs.findUnique({
      where: {
        id: jobId,
      },
      select: {
        payload: true,
      },
    });

    const ret = schema.safeParse(row?.payload);
    return ret.success ? ret.data : ({} as O);
  }
}
