import { z } from 'zod';

import { OneMB } from '../../../base';
import {
  AudioBlobInfoSchema,
  AudioBlobInfosSchema,
  AudioSliceManifestItemSchema,
  LegacyTranscriptionSchema,
  LegacyTranscriptionSegmentSchema,
  MeetingActionItemSchema,
  MeetingSummaryV2Schema,
  NormalizedTranscriptSegmentSchema,
  RawTranscriptSegmentSchema,
  TranscriptionLegacyProjectionSchema,
  TranscriptionPayloadV2Schema,
  TranscriptionQualitySchema,
  TranscriptionRetryMetaSchema,
  TranscriptionSourceAudioSchema,
  TranscriptionSubmitInputSchema,
  TranscriptProviderMetaSchema,
} from './schema';

export type LegacyTranscriptionSegment = z.infer<
  typeof LegacyTranscriptionSegmentSchema
>;
export type LegacyTranscription = z.infer<typeof LegacyTranscriptionSchema>;
export type AudioBlobInfo = z.infer<typeof AudioBlobInfoSchema>;
export type AudioBlobInfos = z.infer<typeof AudioBlobInfosSchema>;
export type AudioSliceManifestItem = z.infer<
  typeof AudioSliceManifestItemSchema
>;
export type RawTranscriptSegment = z.infer<typeof RawTranscriptSegmentSchema>;
export type NormalizedTranscriptSegment = z.infer<
  typeof NormalizedTranscriptSegmentSchema
>;
export type MeetingActionItem = z.infer<typeof MeetingActionItemSchema>;
export type MeetingSummaryV2 = z.infer<typeof MeetingSummaryV2Schema>;
export type TranscriptionSourceAudio = z.infer<
  typeof TranscriptionSourceAudioSchema
>;
export type TranscriptionQuality = z.infer<typeof TranscriptionQualitySchema>;
export type TranscriptionRetryMeta = z.infer<
  typeof TranscriptionRetryMetaSchema
>;
export type TranscriptProviderMeta = z.infer<
  typeof TranscriptProviderMetaSchema
>;
export type TranscriptionLegacyProjection = z.infer<
  typeof TranscriptionLegacyProjectionSchema
>;
export type TranscriptionPayloadV2 = z.infer<
  typeof TranscriptionPayloadV2Schema
>;
export type TranscriptionSubmitInput = z.infer<
  typeof TranscriptionSubmitInputSchema
>;

export type TranscriptionPayload = TranscriptionPayloadV2;
export type TranscriptionItem = LegacyTranscriptionSegment;

declare global {
  interface Events {
    'workspace.file.transcript.finished': {
      jobId: string;
    };
    'workspace.file.transcript.failed': {
      jobId: string;
    };
  }
  interface Jobs {
    'copilot.transcript.submit': {
      jobId: string;
      payload: TranscriptionPayloadV2;
      modelId?: string;
    };
  }
}

export const MAX_TRANSCRIPTION_SIZE = 50 * OneMB;
