import { BadRequestException, Injectable } from '@nestjs/common';
import { AiJobStatus } from '@prisma/client';

import { CopilotTranscriptionJobNotFound, JobQueue } from '../../../base';
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
    await this.job.add('copilot.transcript.task.submit', {
      taskId,
      payload,
      retryOf: task.actionRunId ?? undefined,
    });
    await this.models.copilotTranscriptTask.markRunning(taskId);
    this.realtime.publish(
      'copilot.transcript.task.changed',
      { workspaceId, taskId },
      { taskId, status: AiJobStatus.running },
      { room: realtimeTranscriptTaskRoom(workspaceId, taskId) }
    );
    return {
      id: taskId,
      status: AiJobStatus.running,
      infos: payload.infos ?? undefined,
    };
  }
}
