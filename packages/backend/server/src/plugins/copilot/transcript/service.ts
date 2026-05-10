import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { AiJobStatus } from '@prisma/client';

import {
  CopilotTranscriptionJobExists,
  CopilotTranscriptionJobNotFound,
  type FileUpload,
  JobQueue,
  OnJob,
  sniffMime,
} from '../../../base';
import {
  type RealtimePublisher,
  realtimeTranscriptTaskRoom,
} from '../../../core/realtime';
import { Models } from '../../../models';
import { CopilotAccessPolicy } from '../access';
import { PromptService } from '../prompt';
import { CopilotProviderType } from '../providers/types';
import { ActionRuntimeBridge } from '../runtime/action-runtime-bridge';
import { TaskPolicy } from '../runtime/task-policy';
import { CopilotStorage } from '../storage';
import {
  TranscriptActionResultContract,
  TranscriptPayloadSchema,
} from './schema';
import type {
  AudioBlobInfos,
  TranscriptionPayload,
  TranscriptionPayloadV2,
  TranscriptionSubmitInput,
} from './types';
import { readStream } from './utils';

const TRANSCRIPT_ACTION_ID = 'transcript.audio.gemini';
const TRANSCRIPT_ACTION_VERSION = 'v1';
const TRANSCRIPT_STRATEGY = 'gemini';

export type TranscriptionJob = {
  id: string;
  status: AiJobStatus;
  infos?: AudioBlobInfos;
  transcription?: TranscriptionPayload;
};

function taskStatusToPublicStatus(status: string): AiJobStatus {
  switch (status) {
    case 'pending':
      return AiJobStatus.pending;
    case 'running':
      return AiJobStatus.running;
    case 'ready':
    case 'settled':
      return AiJobStatus.finished;
    default:
      return AiJobStatus.failed;
  }
}

@Injectable()
export class CopilotTranscriptionService {
  constructor(
    private readonly models: Models,
    private readonly job: JobQueue,
    private readonly storage: CopilotStorage,
    private readonly tasks: TaskPolicy,
    private readonly prompts: PromptService,
    private readonly actionBridge: ActionRuntimeBridge,
    @Optional() private readonly access?: CopilotAccessPolicy,
    @Optional() private readonly realtime?: RealtimePublisher
  ) {}

  private parseTaskPayload(payload: unknown): TranscriptionPayloadV2 {
    return TranscriptPayloadSchema.parse(payload);
  }

  private buildTaskPublicMeta(payload: TranscriptionPayloadV2) {
    return {
      sourceAudio: payload.sourceAudio,
      quality: payload.quality,
      sliceManifest: payload.sliceManifest,
      providerMeta: payload.providerMeta,
      version: 'transcript-result-v1',
      strategy: TRANSCRIPT_STRATEGY,
    };
  }

  private taskToJob(
    task: {
      id: string;
      status: string;
      protectedResult: unknown;
    } | null,
    mapStatus: (status: string) => AiJobStatus = taskStatusToPublicStatus
  ): TranscriptionJob | null {
    if (!task) {
      return null;
    }

    const status = mapStatus(task.status);
    const ret: TranscriptionJob = {
      id: task.id,
      status,
    };
    if (task.protectedResult) {
      const parsed = TranscriptPayloadSchema.safeParse(task.protectedResult);
      ret.infos = parsed.success ? (parsed.data.infos ?? []) : [];
      if (task.status === 'settled' && parsed.success) {
        ret.transcription = parsed.data;
      }
    }
    return ret;
  }

  private async resolveTranscriptStrategy(userId: string, strategy?: string) {
    if (strategy && strategy !== TRANSCRIPT_STRATEGY) {
      throw new BadRequestException(
        `Transcript strategy ${strategy} is not available`
      );
    }
    const model = await this.tasks.resolveTranscriptionModel(userId);
    if (!model) {
      throw new BadRequestException(
        'Transcript strategy gemini is not available'
      );
    }
    return { model, strategy: TRANSCRIPT_STRATEGY };
  }

  private async persistUploads(
    userId: string,
    workspaceId: string,
    blobId: string,
    blobs: FileUpload[]
  ) {
    const infos: AudioBlobInfos = [];
    for (const [idx, blob] of blobs.entries()) {
      const buffer = await readStream(blob.createReadStream());
      const url = await this.storage.put(
        userId,
        workspaceId,
        `${blobId}-${idx}`,
        buffer
      );
      infos.push({
        url,
        mimeType: sniffMime(buffer, blob.mimetype) || blob.mimetype,
        index: idx,
      });
    }
    return infos;
  }

  private createCanonicalPayload(
    blobId: string,
    infos: AudioBlobInfos,
    input?: TranscriptionSubmitInput
  ) {
    const sliceManifest = input?.sliceManifest?.length
      ? input.sliceManifest.map(item => ({
          ...item,
          byteSize: item.byteSize ?? null,
        }))
      : undefined;

    return {
      infos,
      sourceAudio: { blobId, ...input?.sourceAudio },
      quality: input?.quality,
      sliceManifest,
    } satisfies TranscriptionPayloadV2;
  }

  private async buildTranscriptActionMessages(
    payload: TranscriptionPayloadV2,
    modelId?: string
  ) {
    const prompt = await this.prompts.get('Transcript audio structured');
    if (!prompt) {
      throw new Error('Transcript action prompt not found');
    }
    const metadata = {
      sourceAudio: payload.sourceAudio ?? null,
      quality: payload.quality ?? null,
      sliceManifest: payload.sliceManifest ?? null,
      infos:
        payload.infos?.map(info => ({
          mimeType: info.mimeType,
          index: info.index ?? null,
        })) ?? null,
      providerMeta: {
        provider: CopilotProviderType.Gemini,
        model: modelId ?? payload.providerMeta?.model ?? null,
      },
    };
    const attachments =
      payload.infos?.map(info => ({
        role: 'user' as const,
        content: `Audio attachment ${info.index ?? 0}`,
        attachments: [{ attachment: info.url, mimeType: info.mimeType }],
        params: { mimetype: info.mimeType },
      })) ?? [];
    return [
      ...this.prompts.finish(prompt, {
        content: JSON.stringify(metadata),
      }),
      ...attachments,
    ];
  }

  async submitTask(
    userId: string,
    workspaceId: string,
    blobId: string,
    blobs: FileUpload[],
    input?: TranscriptionSubmitInput & { strategy?: string | null }
  ): Promise<TranscriptionJob> {
    const existingTask = await this.models.copilotTranscriptTask.getWithUser(
      userId,
      workspaceId,
      undefined,
      blobId
    );
    if (
      existingTask &&
      (existingTask.status === 'pending' || existingTask.status === 'running')
    ) {
      throw new CopilotTranscriptionJobExists();
    }

    await this.access?.assertQuotaOrByok({
      userId,
      workspaceId,
      featureKind: 'transcript',
    });

    const { model, strategy } = await this.resolveTranscriptStrategy(
      userId,
      input?.strategy ?? undefined
    );
    const infos = await this.persistUploads(userId, workspaceId, blobId, blobs);
    const payload = this.createCanonicalPayload(blobId, infos, input);
    const task = await this.models.copilotTranscriptTask.create({
      userId,
      workspaceId,
      blobId,
      strategy,
      recipeId: TRANSCRIPT_ACTION_ID,
      recipeVersion: TRANSCRIPT_ACTION_VERSION,
      inputSnapshot: payload,
      publicMeta: this.buildTaskPublicMeta(payload),
    });

    await this.job.add('copilot.transcript.task.submit', {
      taskId: task.id,
      payload,
      modelId: model,
    });
    await this.models.copilotTranscriptTask.markRunning(task.id);
    this.publishTaskChanged(workspaceId, task.id, AiJobStatus.running);

    return { id: task.id, status: AiJobStatus.running, infos };
  }

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

    await this.access?.assertQuotaOrByok({
      userId,
      workspaceId,
      featureKind: 'transcript',
    });

    const payload = this.parseTaskPayload(task.protectedResult);
    const { model } = await this.resolveTranscriptStrategy(
      userId,
      task.strategy
    );
    await this.job.add('copilot.transcript.task.submit', {
      taskId,
      payload,
      modelId: model,
      retryOf: task.actionRunId ?? undefined,
    });
    await this.models.copilotTranscriptTask.markRunning(taskId);
    this.publishTaskChanged(workspaceId, taskId, AiJobStatus.running);
    return {
      id: taskId,
      status: AiJobStatus.running,
      infos: payload.infos ?? undefined,
    };
  }

  async settleTask(userId: string, workspaceId: string, taskId: string) {
    const task = await this.models.copilotTranscriptTask.getWithUser(
      userId,
      workspaceId,
      taskId
    );
    if (!task) {
      throw new CopilotTranscriptionJobNotFound();
    }
    if (task.status === 'failed') {
      throw new BadRequestException(
        'Failed transcript tasks cannot be settled'
      );
    }
    if (task.status !== 'ready' && task.status !== 'settled') {
      return null;
    }

    if (task.status === 'settled') {
      return this.taskToJob(task);
    }

    await this.access?.assertQuotaOrByok({
      userId,
      workspaceId,
      featureKind: 'transcript',
    });

    const settled = await this.models.copilotTranscriptTask.settle(task.id);
    return this.taskToJob(settled);
  }

  async queryTask(
    userId: string,
    workspaceId: string,
    taskId?: string,
    blobId?: string
  ) {
    const task = await this.models.copilotTranscriptTask.getWithUser(
      userId,
      workspaceId,
      taskId,
      blobId
    );
    if (task) {
      return this.taskToJob(task);
    }
    return null;
  }

  @OnJob('copilot.transcript.task.submit')
  async transcriptTask({
    taskId,
    payload,
    modelId,
    retryOf,
  }: Jobs['copilot.transcript.task.submit']) {
    const task = await this.models.copilotTranscriptTask.get(taskId);
    if (!task) {
      throw new CopilotTranscriptionJobNotFound();
    }

    let actionRunId: string | null = null;
    try {
      let bridgeFailed = false;
      let bridgeError = 'transcript native recipe failed';
      let finalResult: unknown = null;
      const messages = await this.buildTranscriptActionMessages(
        payload,
        modelId
      );
      for await (const event of this.actionBridge.runStream({
        userId: task.userId,
        workspaceId: task.workspaceId,
        actionId: TRANSCRIPT_ACTION_ID,
        actionVersion: TRANSCRIPT_ACTION_VERSION,
        retryOf: retryOf ?? null,
        inputSnapshot: payload,
        nativeInput: {
          input: {
            sourceAudio: payload.sourceAudio ?? null,
            quality: payload.quality ?? null,
            infos: payload.infos ?? null,
            sliceManifest: payload.sliceManifest ?? null,
          },
        },
        onRunCreated: async ({ runId }) => {
          await this.models.copilotTranscriptTask.markRunning(taskId, runId);
          this.publishTaskChanged(
            task.workspaceId,
            taskId,
            AiJobStatus.running
          );
        },
        prepareStructuredRoutes: {
          stepId: 'transcribe',
          modelId,
          messages,
          options: {
            user: task.userId,
            workspace: task.workspaceId,
            taskId,
            billingUnitId: taskId,
            featureKind: 'transcript',
          },
          prefer: CopilotProviderType.Gemini,
          responseContract: TranscriptActionResultContract,
        },
      })) {
        actionRunId = event.runId;
        if (event.type === 'error' || event.status === 'failed') {
          bridgeFailed = true;
          bridgeError = event.errorMessage ?? event.errorCode ?? bridgeError;
        }
        if (event.type === 'action_done' && event.status === 'succeeded') {
          finalResult = event.result;
        }
      }
      if (bridgeFailed) {
        throw new Error(bridgeError);
      }
      const parsedResult = TranscriptPayloadSchema.parse(finalResult);
      await this.models.copilotTranscriptTask.complete(taskId, {
        status: 'ready',
        actionRunId,
        publicMeta: this.buildTaskPublicMeta(parsedResult),
        protectedResult: parsedResult,
        errorCode: null,
      });
      this.publishTaskChanged(task.workspaceId, taskId, AiJobStatus.finished);
    } catch (error) {
      await this.models.copilotTranscriptTask.complete(taskId, {
        status: 'failed',
        actionRunId,
        publicMeta: this.buildTaskPublicMeta(payload),
        protectedResult: payload,
        errorCode:
          error instanceof Error ? error.message : 'transcript_task_failed',
      });
      this.publishTaskChanged(
        task.workspaceId,
        taskId,
        AiJobStatus.failed,
        error instanceof Error ? error.message : 'transcript_task_failed'
      );
      throw error;
    }
  }

  private publishTaskChanged(
    workspaceId: string,
    taskId: string,
    status: AiJobStatus,
    error?: string
  ) {
    this.realtime?.publish(
      'copilot.transcript.task.changed',
      { workspaceId, taskId },
      { taskId, status, error },
      { room: realtimeTranscriptTaskRoom(workspaceId, taskId) }
    );
  }
}
