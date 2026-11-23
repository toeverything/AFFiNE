import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AiJobStatus } from '@prisma/client';

import { CopilotTranscriptionJobNotFound, OneHour } from '../../../base';
import {
  RealtimePublisher,
  realtimeTranscriptTaskRoom,
} from '../../../core/realtime';
import { Models } from '../../../models';
import type {
  CopilotStructuredOptions,
  PromptMessage,
} from '../providers/types';
import type { ActionRuntimeBridgeInput } from '../runtime/action-runtime-bridge';
import { CapabilityRuntime } from '../runtime/capability-runtime';
import type { RequiredStructuredOutputContract } from '../runtime/contracts';
import { TRANSCRIPT_PROMPT_REF } from './constants';
import { TranscriptPayloadSchema } from './schema';
import type { TranscriptionPayloadV2 } from './types';

const TRANSCRIPT_RETRY_DELAYS = [5_000, 15_000];

@Injectable()
export class CopilotTranscriptionRetryService {
  private readonly logger = new Logger(CopilotTranscriptionRetryService.name);

  constructor(
    private readonly models: Models,
    private readonly runtime: CapabilityRuntime,
    private readonly realtime: RealtimePublisher
  ) {}

  async generateStructuredValue(
    input: ActionRuntimeBridgeInput,
    messages: PromptMessage[],
    builtInRouteId: string,
    contract: RequiredStructuredOutputContract,
    stage: string,
    slot = 'prompt.structured'
  ) {
    for (let attempt = 0; ; attempt++) {
      try {
        input.signal?.throwIfAborted();
        return await this.runtime.generateStructuredValue(
          {
            profileId: input.step.profileId,
            modelId: input.step.modelId,
          },
          messages,
          {
            ...(input.step.options as CopilotStructuredOptions | undefined),
            builtInRouteId,
            signal: input.signal ?? input.step.options?.signal,
          },
          contract,
          undefined,
          slot
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryable =
          /upstream returned status (?:429|5\d\d)|RESOURCE_EXHAUSTED|UNAVAILABLE|llm_timeout|timed? out|fetch failed|invalid response field `gemini\.candidates\[0\]`: no candidates returned/i.test(
            message
          );
        const delay = TRANSCRIPT_RETRY_DELAYS[attempt];
        if (!retryable || delay === undefined || input.signal?.aborted) {
          throw new Error(
            `Transcript ${stage} failed after ${attempt + 1} attempt(s): ${message}`,
            { cause: error }
          );
        }
        this.logger.warn(
          `Transcript ${stage} retry ${attempt + 1} in ${delay}ms: ${message}`
        );
        await setTimeout(delay, undefined, { signal: input.signal });
      }
    }
  }

  async retryTask(
    userId: string,
    workspaceId: string,
    taskId: string,
    personal?: boolean
  ) {
    const task = await this.models.copilotTranscriptTask.getWithUser(
      userId,
      workspaceId,
      taskId,
      undefined,
      personal
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
      generation,
      personal
    );
    if (!claimed) {
      throw new BadRequestException(
        'Only failed transcript tasks can be retried'
      );
    }
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

  async collectPendingDispatches() {
    const pending = await this.models.copilotTranscriptTask.pendingDispatches(
      new Date()
    );
    const dispatches: {
      taskId: string;
      payload: TranscriptionPayloadV2;
      generation: string;
      scopeMode: 'personal' | 'canonical';
      retryOf?: string;
    }[] = [];
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
      dispatches.push({
        taskId: task.id,
        payload: parsed.data,
        generation,
        retryOf: task.actionRunId ?? undefined,
        scopeMode:
          (task.inputSnapshot as Record<string, unknown> | null)?.scopeMode ===
          'personal'
            ? 'personal'
            : 'canonical',
      });
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
    return dispatches;
  }
}
