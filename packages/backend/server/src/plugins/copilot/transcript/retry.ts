import { randomUUID } from 'node:crypto';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AiJobStatus } from '@prisma/client';

import {
  CopilotTranscriptionJobNotFound,
  JobQueue,
  OneHour,
  OneMinute,
} from '../../../base';
import {
  RealtimePublisher,
  realtimeTranscriptTaskRoom,
} from '../../../core/realtime';
import { Models } from '../../../models';
import { CapabilityRuntime } from '../runtime/capability-runtime';
import { TRANSCRIPT_PROMPT_REF } from './constants';
import { TranscriptPayloadSchema } from './schema';

@Injectable()
export class CopilotTranscriptionRetryService {
  private readonly logger = new Logger(CopilotTranscriptionRetryService.name);

  constructor(
    private readonly models: Models,
    private readonly job: JobQueue,
    private readonly runtime: CapabilityRuntime,
    private readonly realtime: RealtimePublisher
  ) {}

  async retryTask(userId: string, workspaceId: string, taskId: string) {
    const task = await this.models.copilotTranscriptTask.getWithUser(
      userId,
      workspaceId,
      taskId
    );
    if (!task) {
      throw new CopilotTranscriptionJobNotFound();
    }
    if (task.status === 'ready' || task.status === 'settled') {
      throw new BadRequestException(
        'Ready or settled transcript tasks cannot be retried'
      );
    }
    if (task.status !== 'failed') {
      throw new BadRequestException(
        'Only failed transcript tasks can be retried'
      );
    }

    const payload = TranscriptPayloadSchema.parse(task.protectedResult);
    await this.runtime.assertRoute(
      'transcript.audio',
      {},
      {
        user: userId,
        workspace: workspaceId,
        featureKind: 'transcript',
        builtInRouteId: TRANSCRIPT_PROMPT_REF,
      }
    );
    const generation = randomUUID();
    const retryOf = task.actionRunId ?? null;
    const claimed = await this.models.copilotTranscriptTask.claimRetry(
      taskId,
      userId,
      workspaceId,
      retryOf,
      generation
    );
    if (!claimed) {
      throw new BadRequestException(
        'Only failed transcript tasks can be retried'
      );
    }
    await this.enqueuePendingTask(taskId, payload, generation, retryOf);
    this.realtime.publish(
      'copilot.transcript.task.changed',
      { workspaceId, taskId },
      { taskId, status: AiJobStatus.pending },
      { room: realtimeTranscriptTaskRoom(workspaceId, taskId) }
    );
    return {
      id: taskId,
      status: AiJobStatus.pending,
      infos: payload.infos ?? undefined,
    };
  }

  async enqueuePendingTask(
    taskId: string,
    payload: Jobs['copilot.transcript.task.submit']['payload'],
    generation: string,
    retryOf: string | null,
    rollbackOnError = true
  ) {
    try {
      await this.job.add(
        'copilot.transcript.task.submit',
        {
          taskId,
          payload,
          generation,
          retryOf: retryOf ?? undefined,
        },
        {
          jobId: `copilot-transcript-task/${taskId}/${generation}`,
          attempts: 1,
          removeOnFail: true,
        }
      );
    } catch (error) {
      if (rollbackOnError) {
        await this.models.copilotTranscriptTask.failPendingDispatch(
          taskId,
          generation,
          error instanceof Error ? error.message : 'transcript_enqueue_failed'
        );
      }
      throw error;
    }
  }

  async reconcileDispatches() {
    const pending = await this.models.copilotTranscriptTask.pendingDispatches(
      new Date(Date.now() - OneMinute)
    );
    for (const task of pending) {
      const generation = task.dispatchGeneration;
      if (!generation) continue;
      const parsed = TranscriptPayloadSchema.safeParse(
        task.protectedResult ?? task.inputSnapshot
      );
      if (!parsed.success) {
        await this.models.copilotTranscriptTask.failPendingDispatch(
          task.id,
          generation,
          'invalid_transcript_dispatch_payload'
        );
        continue;
      }
      try {
        await this.enqueuePendingTask(
          task.id,
          parsed.data,
          generation,
          task.actionRunId,
          false
        );
      } catch (error) {
        this.logger.warn(
          `Failed to recover pending transcript task ${task.id}`,
          error
        );
      }
    }

    const running =
      await this.models.copilotTranscriptTask.staleRunningDispatches(
        new Date(Date.now() - OneHour)
      );
    for (const task of running) {
      const generation = task.dispatchGeneration;
      if (!generation) continue;
      const failed =
        await this.models.copilotTranscriptTask.failRunningDispatch(
          task.id,
          generation,
          'transcript_dispatch_timed_out'
        );
      if (failed) {
        this.realtime.publish(
          'copilot.transcript.task.changed',
          { workspaceId: task.workspaceId, taskId: task.id },
          {
            taskId: task.id,
            status: AiJobStatus.failed,
            error: 'transcript_dispatch_timed_out',
          },
          { room: realtimeTranscriptTaskRoom(task.workspaceId, task.id) }
        );
      }
    }
  }
}
