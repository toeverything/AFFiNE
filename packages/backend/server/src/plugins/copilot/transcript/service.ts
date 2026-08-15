import { randomUUID } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';
import { AiJobStatus } from '@prisma/client';

import {
  CopilotTranscriptionJobExists,
  CopilotTranscriptionJobNotFound,
  type FileUpload,
  OnJob,
  sniffMime,
} from '../../../base';
import {
  RealtimePublisher,
  realtimeTranscriptTaskRoom,
} from '../../../core/realtime';
import { Models } from '../../../models';
import { PromptService } from '../prompt';
import { ActionRuntimeBridge } from '../runtime/action-runtime-bridge';
import { CapabilityRuntime } from '../runtime/capability-runtime';
import { CopilotStorage } from '../storage';
import {
  TRANSCRIPT_ACTION_ID,
  TRANSCRIPT_ACTION_VERSION,
  TRANSCRIPT_PROMPT_REF,
} from './constants';
import { taskToJob, type TranscriptionJob } from './job';
import { CopilotTranscriptionRetryService } from './retry';
import {
  TranscriptActionResultContract,
  TranscriptPayloadSchema,
} from './schema';
import type {
  AudioBlobInfos,
  TranscriptionPayloadV2,
  TranscriptionSubmitInput,
} from './types';
import { readStream } from './utils';

@Injectable()
export class CopilotTranscriptionService {
  constructor(
    private readonly models: Models,
    private readonly storage: CopilotStorage,
    private readonly prompts: PromptService,
    private readonly actionBridge: ActionRuntimeBridge,
    private readonly runtime: CapabilityRuntime,
    private readonly realtime: RealtimePublisher,
    private readonly retry: CopilotTranscriptionRetryService
  ) {}

  private buildTaskPublicMeta(payload: TranscriptionPayloadV2) {
    return {
      sourceAudio: payload.sourceAudio,
      quality: payload.quality,
      sliceManifest: payload.sliceManifest,
      version: 'transcript-result-v1',
    };
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
      const key = `${blobId}-${idx}`;
      const url = await this.storage.put(userId, workspaceId, key, buffer);
      infos.push({
        key,
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

  private async resolveAttachmentUrl(
    userId: string,
    workspaceId: string,
    info: AudioBlobInfos[number]
  ) {
    if (info.url.startsWith('data:')) {
      return info.url;
    }

    const key =
      info.key ?? this.storage.keyFromUrl(userId, workspaceId, info.url);
    if (!key) {
      throw new Error('Transcript attachment cannot be resolved');
    }

    const signedUrl = await this.storage.presignGet(userId, workspaceId, key);
    if (!signedUrl) {
      throw new Error('Transcript attachment signing is not configured');
    }
    return signedUrl;
  }

  private async materializePayload(
    userId: string,
    workspaceId: string,
    payload: TranscriptionPayloadV2
  ) {
    return {
      ...payload,
      infos: payload.infos
        ? await Promise.all(
            payload.infos.map(async info => ({
              url: await this.resolveAttachmentUrl(userId, workspaceId, info),
              mimeType: info.mimeType,
              index: info.index,
            }))
          )
        : payload.infos,
    } satisfies TranscriptionPayloadV2;
  }

  private async buildTranscriptActionMessages(payload: TranscriptionPayloadV2) {
    const prompt = await this.prompts.get(TRANSCRIPT_PROMPT_REF);
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
    };
    const attachments = (payload.infos ?? []).map(info => ({
      role: 'user' as const,
      content: `Audio attachment ${info.index ?? 0}`,
      attachments: [{ attachment: info.url, mimeType: info.mimeType }],
      params: { mimetype: info.mimeType },
    }));
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
    input?: TranscriptionSubmitInput
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
    const infos = await this.persistUploads(userId, workspaceId, blobId, blobs);
    const payload = this.createCanonicalPayload(blobId, infos, input);
    const generation = randomUUID();
    const task = await this.models.copilotTranscriptTask.create({
      userId,
      workspaceId,
      blobId,
      recipeId: TRANSCRIPT_ACTION_ID,
      recipeVersion: TRANSCRIPT_ACTION_VERSION,
      dispatchGeneration: generation,
      inputSnapshot: payload,
      publicMeta: this.buildTaskPublicMeta(payload),
      protectedResult: payload,
    });

    await this.retry.enqueuePendingTask(task.id, payload, generation, null);
    this.publishTaskChanged(workspaceId, task.id, AiJobStatus.pending);

    return { id: task.id, status: AiJobStatus.pending, infos };
  }

  async retryTask(userId: string, workspaceId: string, taskId: string) {
    return await this.retry.retryTask(userId, workspaceId, taskId);
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
      return taskToJob(task);
    }

    const settled = await this.models.copilotTranscriptTask.settle(task.id);
    return taskToJob(settled);
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
    return taskToJob(task);
  }

  @OnJob('copilot.transcript.task.submit')
  async transcriptTask({
    taskId,
    payload,
    generation: queuedGeneration,
    retryOf,
  }: Jobs['copilot.transcript.task.submit']) {
    const task = await this.models.copilotTranscriptTask.get(taskId);
    if (!task) {
      throw new CopilotTranscriptionJobNotFound();
    }
    let actionRunId = retryOf ?? null;
    const generation = queuedGeneration ?? randomUUID();
    if (
      !queuedGeneration &&
      !(await this.models.copilotTranscriptTask.adoptLegacyDispatch(
        taskId,
        actionRunId,
        generation
      ))
    ) {
      return;
    }
    const claimed = await this.models.copilotTranscriptTask.claimDispatch(
      taskId,
      generation,
      actionRunId
    );
    if (!claimed) {
      return;
    }

    try {
      let bridgeFailed = false;
      let bridgeError = 'transcript native recipe failed';
      let finalResult: unknown = null;
      const runtimePayload = await this.materializePayload(
        task.userId,
        task.workspaceId,
        payload
      );
      const messages = await this.buildTranscriptActionMessages(runtimePayload);
      for await (const event of this.actionBridge.runStream({
        userId: task.userId,
        workspaceId: task.workspaceId,
        actionId: TRANSCRIPT_ACTION_ID,
        actionVersion: TRANSCRIPT_ACTION_VERSION,
        retryOf: retryOf ?? null,
        inputSnapshot: runtimePayload,
        onRunCreated: async ({ runId }) => {
          const attached =
            await this.models.copilotTranscriptTask.attachActionRun(
              taskId,
              generation,
              actionRunId,
              runId
            );
          if (!attached) {
            throw new Error('stale transcript dispatch generation');
          }
          actionRunId = runId;
          this.publishTaskChanged(
            task.workspaceId,
            taskId,
            AiJobStatus.running
          );
        },
        step: {
          slot: 'transcript.audio',
          builtInRouteId: TRANSCRIPT_PROMPT_REF,
          messages,
          options: {
            user: task.userId,
            workspace: task.workspaceId,
            taskId,
            billingUnitId: taskId,
            featureKind: 'transcript',
          },
          responseContract: TranscriptActionResultContract,
        },
      })) {
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
      const parsedResult = {
        ...TranscriptPayloadSchema.parse(finalResult),
        infos: payload.infos,
      } satisfies TranscriptionPayloadV2;
      const completed =
        await this.models.copilotTranscriptTask.completeDispatch(
          taskId,
          generation,
          actionRunId,
          {
            status: 'ready',
            publicMeta: this.buildTaskPublicMeta(parsedResult),
            protectedResult: parsedResult,
            errorCode: null,
          }
        );
      if (completed) {
        this.publishTaskChanged(task.workspaceId, taskId, AiJobStatus.finished);
      }
    } catch (error) {
      const errorCode =
        error instanceof Error ? error.message : 'transcript_task_failed';
      const failed = await this.models.copilotTranscriptTask.completeDispatch(
        taskId,
        generation,
        actionRunId,
        {
          status: 'failed',
          publicMeta: this.buildTaskPublicMeta(payload),
          protectedResult: payload,
          errorCode,
        }
      );
      if (failed) {
        this.publishTaskChanged(
          task.workspaceId,
          taskId,
          AiJobStatus.failed,
          errorCode
        );
      }
      throw error;
    }
  }

  private publishTaskChanged(
    workspaceId: string,
    taskId: string,
    status: AiJobStatus,
    error?: string
  ) {
    this.realtime.publish(
      'copilot.transcript.task.changed',
      { workspaceId, taskId },
      { taskId, status, error },
      { room: realtimeTranscriptTaskRoom(workspaceId, taskId) }
    );
  }
}
