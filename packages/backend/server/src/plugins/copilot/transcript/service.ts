import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
import type {
  CopilotStructuredOptions,
  PromptMessage,
} from '../providers/types';
import {
  ActionRuntimeBridge,
  type ActionRuntimeBridgeInput,
} from '../runtime/action-runtime-bridge';
import { CapabilityRuntime } from '../runtime/capability-runtime';
import type { RequiredStructuredOutputContract } from '../runtime/contracts';
import { CopilotStorage } from '../storage';
import {
  TRANSCRIPT_ACTION_ID,
  TRANSCRIPT_ACTION_VERSION,
  TRANSCRIPT_PROMPT_REF,
  TRANSCRIPT_SUMMARY_PROMPT_REF,
} from './constants';
import { taskToJob, type TranscriptionJob } from './job';
import {
  buildNormalizedTranscript,
  normalizeTranscriptSegments,
  type RawTranscriptSegment,
} from './projection';
import { CopilotTranscriptionRetryService } from './retry';
import {
  MeetingSummaryV2Contract,
  MeetingSummaryV2Schema,
  TranscriptionResponseContract,
  TranscriptionResponseSchema,
  TranscriptPayloadSchema,
} from './schema';
import type {
  AudioBlobInfo,
  AudioBlobInfos,
  TranscriptionPayloadV2,
  TranscriptionSubmitInput,
} from './types';
import { readStream } from './utils';

const TRANSCRIPT_SLICE_CONCURRENCY = 2;
const TRANSCRIPT_RETRY_DELAYS = [5_000, 15_000];
const MAX_RECOVERABLE_TIMESTAMP_RATIO = 2;
const MIN_MILLISECOND_TIMESTAMP_RATIO = 100;

@Injectable()
export class CopilotTranscriptionService {
  private readonly logger = new Logger(CopilotTranscriptionService.name);

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

  private async buildTranscriptSliceMessages(info: AudioBlobInfo) {
    const prompt = await this.prompts.get(TRANSCRIPT_PROMPT_REF);
    if (!prompt) {
      throw new Error('Transcript prompt not found');
    }

    return [
      ...this.prompts.finish(prompt, {}),
      {
        role: 'user' as const,
        content:
          'Transcribe this audio slice. Return start and end timestamps as elapsed seconds relative to this slice; never encode MM:SS as a number.',
        attachments: [{ attachment: info.url, mimeType: info.mimeType }],
        params: { mimetype: info.mimeType },
      },
    ];
  }

  private async buildMeetingSummaryMessages(normalizedTranscript: string) {
    const prompt = await this.prompts.get(TRANSCRIPT_SUMMARY_PROMPT_REF);
    if (!prompt) {
      throw new Error('Transcript summary prompt not found');
    }
    return this.prompts.finish(prompt, { content: normalizedTranscript });
  }

  private rebaseManifestlessSlices(
    infos: AudioBlobInfos,
    slices: RawTranscriptSegment[][]
  ) {
    let accumulatedOffset = 0;
    return slices
      .map((segments, fallbackIndex) => ({
        fallbackIndex,
        sliceIndex: infos[fallbackIndex]?.index ?? fallbackIndex,
        segments,
      }))
      .sort(
        (left, right) =>
          left.sliceIndex - right.sliceIndex ||
          left.fallbackIndex - right.fallbackIndex
      )
      .flatMap(({ segments }) => {
        const rebased = segments.map(segment => ({
          ...segment,
          startSec: segment.startSec + accumulatedOffset,
          endSec: segment.endSec + accumulatedOffset,
        }));
        accumulatedOffset += Math.max(
          0,
          ...segments.map(segment => segment.endSec)
        );
        return rebased;
      });
  }

  private async transcribeSlice(
    input: ActionRuntimeBridgeInput,
    info: AudioBlobInfo,
    fallbackIndex: number,
    offset: number,
    durationSec?: number
  ): Promise<RawTranscriptSegment[]> {
    const messages = await this.buildTranscriptSliceMessages(info);
    const output = await this.generateStructuredValue(
      input,
      messages,
      TRANSCRIPT_PROMPT_REF,
      TranscriptionResponseContract,
      'transcript.audio'
    );
    const sliceIndex = info.index ?? fallbackIndex;
    const response = TranscriptionResponseSchema.parse(output.value);
    const timestamps = response.flatMap(segment => [segment.s, segment.e]);
    const maxTs = Math.max(0, ...timestamps);
    const maxAllowed = durationSec === undefined ? Infinity : durationSec + 5;
    let scale = 1;
    let convertMmss = false;
    if (durationSec !== undefined && maxTs > maxAllowed) {
      const mmssTimestamps = timestamps.map(timestamp => {
        const minutes = Math.floor(timestamp / 100);
        const seconds = timestamp - minutes * 100;
        return seconds < 60 ? minutes * 60 + seconds : null;
      });
      if (mmssTimestamps.every(ts => ts !== null && ts <= maxAllowed)) {
        convertMmss = true;
      } else if (
        durationSec > 0 &&
        maxTs >= durationSec * MIN_MILLISECOND_TIMESTAMP_RATIO &&
        maxTs / 1000 <= maxAllowed
      ) {
        scale = 0.001;
      } else if (maxTs <= durationSec * MAX_RECOVERABLE_TIMESTAMP_RATIO) {
        scale = durationSec / maxTs;
      } else {
        scale = 1;
      }
    }

    let correctedTimestamps = 0;
    const normalizeTimestamp = (timestamp: number, index: number) => {
      const minutes = Math.floor(timestamp / 100);
      const seconds = timestamp - minutes * 100;
      const converted = convertMmss
        ? minutes * 60 + seconds
        : timestamp * scale;
      const bounded =
        durationSec === undefined
          ? Math.max(0, converted)
          : Math.min(Math.max(converted, 0), durationSec);
      if (bounded !== timestamp) correctedTimestamps += 1;
      if (!Number.isFinite(bounded)) {
        this.logger.warn(
          `Invalid timestamp at position ${index} in transcript slice ${sliceIndex}`
        );
        return 0;
      }
      return bounded;
    };

    const segments = response.map((segment, index) => {
      const startSec = normalizeTimestamp(segment.s, index * 2);
      const endSec = normalizeTimestamp(segment.e, index * 2 + 1);
      return {
        sliceIndex,
        speaker: segment.a,
        startSec: startSec + offset,
        endSec: endSec + offset,
        text: segment.t,
      };
    });

    if (correctedTimestamps > 0) {
      this.logger.warn(
        `Normalized ${correctedTimestamps} out-of-range transcript timestamps for slice ${sliceIndex} (duration=${durationSec ?? 'unknown'}s, scale=${scale}, mmss=${convertMmss})`
      );
    }
    return segments;
  }

  private async generateStructuredValue(
    input: ActionRuntimeBridgeInput,
    messages: PromptMessage[],
    builtInRouteId: string,
    contract: RequiredStructuredOutputContract,
    slot = 'prompt.structured'
  ) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.runtime.generateStructuredValue(
          {
            profileId: input.step.profileId,
            modelId: input.step.modelId,
          },
          messages,
          {
            ...(input.step.options as CopilotStructuredOptions | undefined),
            builtInRouteId,
          },
          contract,
          undefined,
          slot
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryable =
          /upstream returned status (?:429|5\d\d)|RESOURCE_EXHAUSTED|UNAVAILABLE|llm_timeout|timed? out|fetch failed/i.test(
            message
          );
        const delay = TRANSCRIPT_RETRY_DELAYS[attempt];
        if (!retryable || delay === undefined || input.signal?.aborted) {
          throw error;
        }
        await setTimeout(delay, undefined, { signal: input.signal });
      }
    }
  }

  private async executeTranscriptAction(
    input: ActionRuntimeBridgeInput,
    payload: TranscriptionPayloadV2
  ) {
    const infos = payload.infos ?? [];
    const slices: RawTranscriptSegment[][] = [];
    const manifestProvided = !!payload.sliceManifest?.length;

    for (
      let batchStart = 0;
      batchStart < infos.length;
      batchStart += TRANSCRIPT_SLICE_CONCURRENCY
    ) {
      const batch = infos.slice(
        batchStart,
        batchStart + TRANSCRIPT_SLICE_CONCURRENCY
      );
      await Promise.all(
        batch.map(async (info, batchIndex) => {
          const index = batchStart + batchIndex;
          const manifestItem = manifestProvided
            ? payload.sliceManifest?.find(
                item => item.index === (info.index ?? index)
              )
            : undefined;
          slices[index] = await this.transcribeSlice(
            input,
            info,
            index,
            manifestItem?.startSec ?? 0,
            manifestItem?.durationSec
          );
        })
      );
    }

    const rawSegments = manifestProvided
      ? slices.flat()
      : this.rebaseManifestlessSlices(infos, slices);
    const normalizedSegments = normalizeTranscriptSegments(rawSegments);
    const normalizedTranscript = buildNormalizedTranscript(normalizedSegments);
    let summaryJson = null;

    if (normalizedTranscript) {
      const messages =
        await this.buildMeetingSummaryMessages(normalizedTranscript);
      const output = await this.generateStructuredValue(
        input,
        messages,
        TRANSCRIPT_SUMMARY_PROMPT_REF,
        MeetingSummaryV2Contract
      );
      summaryJson = MeetingSummaryV2Schema.parse(output.value);
    }

    return {
      result: {
        sourceAudio: payload.sourceAudio,
        quality: payload.quality,
        sliceManifest: payload.sliceManifest,
        normalizedSegments,
        normalizedTranscript,
        summaryJson,
        version: 'transcript-result-v1',
      } satisfies TranscriptionPayloadV2,
    };
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
    generation,
    retryOf,
  }: Jobs['copilot.transcript.task.submit']) {
    const task = await this.models.copilotTranscriptTask.get(taskId);
    if (!task) {
      throw new CopilotTranscriptionJobNotFound();
    }
    let actionRunId = retryOf ?? null;
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
      for await (const event of this.actionBridge.runStream(
        {
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
            messages: [],
            options: {
              user: task.userId,
              workspace: task.workspaceId,
              taskId,
              billingUnitId: taskId,
              featureKind: 'transcript',
            },
          },
        },
        input => this.executeTranscriptAction(input, runtimePayload)
      )) {
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
