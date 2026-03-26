import { Injectable } from '@nestjs/common';
import { AiJobStatus, AiJobType } from '@prisma/client';
import type { JsonValue } from '@prisma/client/runtime/library';
import { ZodType } from 'zod';

import {
  CopilotPromptNotFound,
  CopilotTranscriptionJobExists,
  CopilotTranscriptionJobNotFound,
  EventBus,
  type FileUpload,
  JobQueue,
  NoCopilotProviderAvailable,
  OnEvent,
  OnJob,
  sniffMime,
} from '../../../base';
import { Models } from '../../../models';
import { PromptService } from '../prompt/service';
import type { CopilotProvider, PromptMessage } from '../providers';
import { CopilotProviderFactory } from '../providers/factory';
import { CopilotProviderType, ModelOutputType } from '../providers/types';
import { CopilotStorage } from '../storage';
import {
  buildLegacyProjection,
  buildNormalizedTranscript,
  normalizeTranscriptSegments,
} from './projection';
import {
  MeetingSummaryV2Schema,
  TranscriptionResponseSchema,
  TranscriptPayloadSchema,
} from './schema';
import type {
  AudioBlobInfo,
  AudioBlobInfos,
  AudioSliceManifestItem,
  MeetingSummaryV2,
  RawTranscriptSegment,
  TranscriptionPayload,
  TranscriptionPayloadV2,
  TranscriptionSubmitInput,
} from './types';
import { readStream } from './utils';

export type TranscriptionJob = {
  id: string;
  status: AiJobStatus;
  infos?: AudioBlobInfos;
  transcription?: TranscriptionPayload;
};

const QueryableTranscriptionStatuses: Set<AiJobStatus> = new Set([
  AiJobStatus.finished,
  AiJobStatus.claimed,
]);

@Injectable()
export class CopilotTranscriptionService {
  constructor(
    private readonly event: EventBus,
    private readonly models: Models,
    private readonly job: JobQueue,
    private readonly storage: CopilotStorage,
    private readonly prompt: PromptService,
    private readonly providerFactory: CopilotProviderFactory
  ) {}

  private async getModel(userId: string) {
    const prompt = await this.prompt.get('Transcript audio');
    const hasAccess = await this.models.userFeature.has(
      userId,
      'unlimited_copilot'
    );

    return prompt?.optionalModels[hasAccess ? 1 : 0];
  }

  private async getPayload(jobId: string) {
    return this.models.copilotJob.getPayload(jobId, TranscriptPayloadSchema);
  }

  private toJobPayload(payload: TranscriptionPayloadV2): JsonValue {
    return payload as unknown as JsonValue;
  }

  private async updatePayload(
    jobId: string,
    updater: (
      payload: TranscriptionPayloadV2
    ) => Promise<TranscriptionPayloadV2> | TranscriptionPayloadV2
  ) {
    const current = await this.getPayload(jobId);
    const next = await updater(current);
    const payload = { ...next, legacy: buildLegacyProjection(next) };

    await this.models.copilotJob.update(jobId, {
      payload: this.toJobPayload(payload),
    });
    return payload;
  }

  private canReuseTranscript(payload: TranscriptionPayloadV2) {
    return (
      payload.retryMeta?.skipAsrOnRetry === true &&
      !!payload.normalizedTranscript &&
      !!payload.rawSegments?.length &&
      !!payload.normalizedSegments?.length
    );
  }

  private async createCanonicalPayload(
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

  async submitJob(
    userId: string,
    workspaceId: string,
    blobId: string,
    blobs: FileUpload[],
    input?: TranscriptionSubmitInput
  ): Promise<TranscriptionJob> {
    if (await this.models.copilotJob.has(userId, workspaceId, blobId)) {
      throw new CopilotTranscriptionJobExists();
    }

    const { id: jobId } = await this.models.copilotJob.create({
      workspaceId,
      blobId,
      createdBy: userId,
      type: AiJobType.transcription,
    });

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

    const payload = await this.createCanonicalPayload(blobId, infos, input);
    const model = await this.getModel(userId);
    return await this.executeJob(jobId, payload, model);
  }

  async retryJob(userId: string, workspaceId: string, jobId: string) {
    const job = await this.queryJob(userId, workspaceId, jobId);
    if (!job?.infos?.length) {
      throw new CopilotTranscriptionJobNotFound();
    }

    const payload = await this.getPayload(job.id);
    const model = await this.getModel(userId);

    return await this.executeJob(job.id, payload, model);
  }

  async executeJob(
    jobId: string,
    payload: TranscriptionPayloadV2,
    modelId?: string
  ): Promise<TranscriptionJob> {
    const status = AiJobStatus.running;
    const success = await this.models.copilotJob.update(jobId, {
      status,
      payload: this.toJobPayload({
        ...payload,
        legacy: buildLegacyProjection(payload),
      }),
    });

    if (!success) {
      throw new CopilotTranscriptionJobNotFound();
    }

    await this.job.add('copilot.transcript.submit', {
      jobId,
      payload,
      modelId,
    });

    return { id: jobId, status };
  }

  async claimJob(
    userId: string,
    jobId: string
  ): Promise<TranscriptionJob | null> {
    const status = await this.models.copilotJob.claim(jobId, userId);
    if (status === AiJobStatus.claimed) {
      const transcription = await this.getPayload(jobId);
      return { id: jobId, transcription, status };
    }
    return null;
  }

  async queryJob(
    userId: string,
    workspaceId: string,
    jobId?: string,
    blobId?: string
  ) {
    const job = await this.models.copilotJob.getWithUser(
      userId,
      workspaceId,
      jobId,
      blobId,
      AiJobType.transcription
    );

    if (!job) {
      return null;
    }

    const payload = TranscriptPayloadSchema.safeParse(job.payload);
    if (!payload.success) {
      return { id: job.id, status: job.status };
    }

    const ret: TranscriptionJob = {
      id: job.id,
      status: job.status,
      infos: payload.data.infos ?? [],
    };

    if (QueryableTranscriptionStatuses.has(job.status)) {
      ret.transcription = payload.data;
    }

    return ret;
  }

  private async getProvider(
    modelId: string,
    structured: boolean,
    prefer?: CopilotProviderType
  ): Promise<CopilotProvider> {
    const provider = await this.providerFactory.getProvider(
      {
        outputType: structured
          ? ModelOutputType.Structured
          : ModelOutputType.Text,
        modelId,
      },
      { prefer }
    );

    if (!provider) {
      throw new NoCopilotProviderAvailable({ modelId });
    }

    return provider;
  }

  private async chatWithPrompt(
    promptName: string,
    message: Partial<PromptMessage>,
    schema?: ZodType<any>,
    prefer?: CopilotProviderType,
    modelId?: string
  ): Promise<string> {
    const prompt = await this.prompt.get(promptName);
    if (!prompt) {
      throw new CopilotPromptNotFound({ name: promptName });
    }

    const cond = {
      modelId:
        modelId && prompt.optionalModels.includes(modelId)
          ? modelId
          : prompt.model,
    };
    const msg = { role: 'user' as const, content: '', ...message };
    const config = Object.assign({}, prompt.config);

    if (schema) {
      const provider = await this.getProvider(cond.modelId, true, prefer);
      return provider.structure(cond, [...prompt.finish({}), msg], {
        ...config,
        schema,
      });
    }

    const provider = await this.getProvider(cond.modelId, false, prefer);
    return provider.text(cond, [...prompt.finish({}), msg], config);
  }

  private getSliceOffset(
    sliceManifest: AudioSliceManifestItem[] | undefined,
    info: AudioBlobInfo,
    fallbackIndex: number
  ) {
    const sliceIndex = info.index ?? fallbackIndex;
    return (
      sliceManifest?.find(item => item.index === sliceIndex)?.startSec ?? 0
    );
  }

  private rebaseManifestlessTranscriptSlices(
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
      .sort((left, right) => {
        return (
          left.sliceIndex - right.sliceIndex ||
          left.fallbackIndex - right.fallbackIndex
        );
      })
      .flatMap(({ segments }) => {
        const rebasedSegments = segments.map(segment => ({
          ...segment,
          startSec: segment.startSec + accumulatedOffset,
          endSec: segment.endSec + accumulatedOffset,
        }));

        accumulatedOffset += Math.max(
          0,
          ...segments.map(segment => segment.endSec)
        );

        return rebasedSegments;
      });
  }

  private async callTranscript(
    info: AudioBlobInfo,
    offset: number,
    modelId?: string
  ): Promise<RawTranscriptSegment[]> {
    const result = await this.chatWithPrompt(
      'Transcript audio',
      { attachments: [info.url], params: { mimetype: info.mimeType } },
      TranscriptionResponseSchema,
      CopilotProviderType.Gemini,
      modelId
    );

    return TranscriptionResponseSchema.parse(JSON.parse(result)).map(
      segment => ({
        source: 'asr',
        sliceIndex: info.index ?? 0,
        speaker: segment.a,
        startSec: segment.s + offset,
        endSec: segment.e + offset,
        text: segment.t,
      })
    );
  }

  private async summarizeMeeting(
    normalizedTranscript: string
  ): Promise<MeetingSummaryV2> {
    const result = await this.chatWithPrompt(
      'Summarize the meeting structured',
      { content: normalizedTranscript },
      MeetingSummaryV2Schema
    );

    return MeetingSummaryV2Schema.parse(JSON.parse(result));
  }

  @OnJob('copilot.transcript.submit')
  async transcriptAudio({
    jobId,
    payload,
    modelId,
  }: Jobs['copilot.transcript.submit']) {
    try {
      const reusesTranscript = this.canReuseTranscript(payload);
      let normalizedTranscript = payload.normalizedTranscript ?? null;

      if (!reusesTranscript) {
        const infos = payload.infos ?? [];
        const manifestProvided = !!payload.sliceManifest?.length;
        const transcriptSlices = await Promise.all(
          infos.map((info, index) =>
            this.callTranscript(
              info,
              this.getSliceOffset(
                manifestProvided ? payload.sliceManifest : undefined,
                info,
                index
              ),
              modelId
            )
          )
        );
        const rawSegments = manifestProvided
          ? transcriptSlices.flat()
          : this.rebaseManifestlessTranscriptSlices(infos, transcriptSlices);

        const normalizedSegments = normalizeTranscriptSegments(rawSegments);
        normalizedTranscript =
          buildNormalizedTranscript(normalizedSegments) || null;

        await this.updatePayload(jobId, current => ({
          ...current,
          infos: payload.infos ?? current.infos,
          sourceAudio: payload.sourceAudio ?? current.sourceAudio,
          quality: payload.quality ?? current.quality,
          sliceManifest: payload.sliceManifest ?? current.sliceManifest,
          rawSegments,
          normalizedSegments,
          normalizedTranscript,
          summaryJson: null,
          providerMeta: {
            provider: CopilotProviderType.Gemini,
            model: modelId ?? payload.providerMeta?.model ?? null,
          },
          retryMeta: undefined,
        }));
      }

      if (normalizedTranscript) {
        try {
          const summaryJson = await this.summarizeMeeting(normalizedTranscript);
          await this.updatePayload(jobId, current => ({
            ...current,
            summaryJson,
            retryMeta: undefined,
          }));
        } catch (error) {
          await this.updatePayload(jobId, current => ({
            ...current,
            retryMeta: reusesTranscript ? undefined : { skipAsrOnRetry: true },
          }));
          throw error;
        }
      }

      this.event.emit('workspace.file.transcript.finished', {
        jobId,
      });
      return;
    } catch (error) {
      this.event.emit('workspace.file.transcript.failed', {
        jobId,
      });
      throw error;
    }
  }

  @OnEvent('workspace.file.transcript.finished')
  async onFileTranscriptFinish({
    jobId,
  }: Events['workspace.file.transcript.finished']) {
    await this.models.copilotJob.update(jobId, {
      status: AiJobStatus.finished,
    });
  }

  @OnEvent('workspace.file.transcript.failed')
  async onFileTranscriptFailed({
    jobId,
  }: Events['workspace.file.transcript.failed']) {
    await this.models.copilotJob.update(jobId, {
      status: AiJobStatus.failed,
    });
  }
}
