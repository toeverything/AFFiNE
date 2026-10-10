import { Injectable, Logger } from '@nestjs/common';

import { readBufferWithLimit } from '../../../base';
import { splitTranscriptAudio } from '../../../native';
import { PromptService } from '../prompt';
import type { ActionRuntimeBridgeInput } from '../runtime/action-runtime-bridge';
import { CopilotStorage } from '../storage';
import {
  TRANSCRIPT_PROMPT_REF,
  TRANSCRIPT_SUMMARY_PROMPT_REF,
} from './constants';
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
} from './schema';
import {
  type AudioBlobInfo,
  type AudioBlobInfos,
  MAX_TRANSCRIPTION_SIZE,
  type TranscriptionPayloadV2,
} from './types';

const TRANSCRIPT_SLICE_CONCURRENCY = 2;
const MAX_RECOVERABLE_TIMESTAMP_RATIO = 2;
const MIN_MILLISECOND_TIMESTAMP_RATIO = 100;

function isContentBlocked(error: unknown): error is Error {
  return (
    error instanceof Error &&
    /invalid response field `gemini\.promptFeedback\.blockReason`: prompt blocked: (?!BLOCK_REASON_UNSPECIFIED\b)[A-Z_]+/.test(
      error.message
    )
  );
}

@Injectable()
export class CopilotTranscriptionProcessor {
  private readonly logger = new Logger(CopilotTranscriptionProcessor.name);

  constructor(
    private readonly storage: CopilotStorage,
    private readonly prompts: PromptService,
    private readonly retry: CopilotTranscriptionRetryService
  ) {}

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
    return this.prompts.finish(prompt, {
      content: normalizedTranscript.includes('[Transcription unavailable:')
        ? `Some audio intervals could not be transcribed. The bracketed unavailability notices are not speech. Summarize only the available speech; do not infer missing content.\n\n${normalizedTranscript}`
        : normalizedTranscript,
    });
  }

  private rebaseManifestlessSlices(
    infos: AudioBlobInfos,
    slices: RawTranscriptSegment[][],
    durations: (number | undefined)[]
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
      .flatMap(({ segments, fallbackIndex }) => {
        const rebased = segments.map(segment => ({
          ...segment,
          startSec: segment.startSec + accumulatedOffset,
          endSec: segment.endSec + accumulatedOffset,
        }));
        accumulatedOffset +=
          durations[fallbackIndex] ??
          Math.max(0, ...segments.map(segment => segment.endSec));
        return rebased;
      });
  }

  private async transcribeSlice(
    input: ActionRuntimeBridgeInput,
    info: AudioBlobInfo,
    fallbackIndex: number,
    offset: number,
    durationSec?: number,
    stage = `slice ${info.index ?? fallbackIndex}`
  ): Promise<RawTranscriptSegment[]> {
    const messages = await this.buildTranscriptSliceMessages(info);
    const output = await this.retry.generateStructuredValue(
      input,
      messages,
      TRANSCRIPT_PROMPT_REF,
      TranscriptionResponseContract,
      stage,
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

  async execute(
    input: ActionRuntimeBridgeInput,
    payload: TranscriptionPayloadV2
  ) {
    const infos = payload.infos ?? [];
    const slices: RawTranscriptSegment[][] = [];
    const durations: (number | undefined)[] = [];
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
          const slice = await this.transcribeRecoverableSlice(
            input,
            info,
            index,
            manifestItem?.startSec ?? 0,
            manifestItem?.durationSec
          );
          slices[index] = slice.segments;
          durations[index] = slice.durationSec;
        })
      );
    }

    const rawSegments = manifestProvided
      ? slices.flat()
      : this.rebaseManifestlessSlices(infos, slices, durations);
    const normalizedSegments = normalizeTranscriptSegments(rawSegments);
    const normalizedTranscript = buildNormalizedTranscript(normalizedSegments);
    let summaryJson = null;

    if (normalizedTranscript) {
      const messages =
        await this.buildMeetingSummaryMessages(normalizedTranscript);
      const output = await this.retry.generateStructuredValue(
        input,
        messages,
        TRANSCRIPT_SUMMARY_PROMPT_REF,
        MeetingSummaryV2Contract,
        'summary'
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

  private async transcribeRecoverableSlice(
    input: ActionRuntimeBridgeInput,
    info: AudioBlobInfo,
    fallbackIndex: number,
    offset: number,
    durationSec?: number
  ): Promise<{ segments: RawTranscriptSegment[]; durationSec?: number }> {
    const signal = input.signal ?? input.step.options?.signal;
    try {
      const segments = await this.transcribeSlice(
        input,
        info,
        fallbackIndex,
        offset,
        durationSec
      );
      return { segments, durationSec };
    } catch (error) {
      if (!isContentBlocked(error)) throw error;
      signal?.throwIfAborted();
      const mimeType = info.mimeType.split(';', 1)[0].trim().toLowerCase();
      if (!['audio/ogg', 'audio/opus', 'application/ogg'].includes(mimeType)) {
        throw error;
      }
      let parts: Awaited<ReturnType<typeof splitTranscriptAudio>>;
      try {
        let data: Buffer;
        if (info.key) {
          const object = await this.storage.getSessionAttachment(
            input.userId,
            input.workspaceId,
            info.key
          );
          if (!object.body)
            throw new Error('Transcript recovery audio not found');
          data = await readBufferWithLimit(object.body, MAX_TRANSCRIPTION_SIZE);
        } else if (
          info.url.startsWith('data:') &&
          info.url.includes(';base64,')
        ) {
          data = Buffer.from(
            info.url.slice(info.url.indexOf(',') + 1),
            'base64'
          );
        } else {
          throw new Error('Transcript recovery audio cannot be resolved');
        }
        parts = await splitTranscriptAudio(data);
      } catch (recoveryError) {
        signal?.throwIfAborted();
        const reason =
          recoveryError instanceof Error
            ? recoveryError.message
            : String(recoveryError);
        throw new Error(`${error.message}; audio recovery failed: ${reason}`, {
          cause: error,
        });
      }
      const sliceIndex = info.index ?? fallbackIndex;
      this.logger.warn(
        `Recovering blocked transcript slice ${sliceIndex} using ${parts.length} audio parts`
      );
      const segments: RawTranscriptSegment[] = [];
      for (const [partIndex, part] of parts.entries()) {
        signal?.throwIfAborted();
        const partOffset = offset + part.startSec;
        try {
          segments.push(
            ...(await this.transcribeSlice(
              input,
              {
                index: sliceIndex,
                mimeType: 'audio/ogg',
                url: `data:audio/ogg;base64,${part.data.toString('base64')}`,
              },
              fallbackIndex,
              partOffset,
              part.durationSec,
              `slice ${sliceIndex} part ${partIndex + 1}/${parts.length}`
            ))
          );
        } catch (partError) {
          if (!isContentBlocked(partError)) throw partError;
          signal?.throwIfAborted();
          segments.push({
            sliceIndex,
            speaker: 'Transcription',
            startSec: partOffset,
            endSec: partOffset + part.durationSec,
            text: '[Transcription unavailable: this audio interval was blocked by the provider.]',
          });
        }
      }
      const lastPart = parts[parts.length - 1];
      return {
        segments,
        durationSec: lastPart.startSec + lastPart.durationSec,
      };
    }
  }
}
