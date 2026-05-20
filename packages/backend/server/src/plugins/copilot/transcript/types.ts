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
  TranscriptionLegacyProjectionSchema,
  TranscriptionPayloadV2Schema,
  TranscriptionQualitySchema,
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
export type NormalizedTranscriptSegment = z.infer<
  typeof NormalizedTranscriptSegmentSchema
>;
export type MeetingActionItem = z.infer<typeof MeetingActionItemSchema>;
export type MeetingSummaryV2 = z.infer<typeof MeetingSummaryV2Schema>;
export type TranscriptionSourceAudio = z.infer<
  typeof TranscriptionSourceAudioSchema
>;
export type TranscriptionQuality = z.infer<typeof TranscriptionQualitySchema>;
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
  interface Jobs {
    'copilot.transcript.task.submit': {
      taskId: string;
      payload: TranscriptionPayloadV2;
      modelId?: string;
      retryOf?: string;
    };
  }
}

export const MAX_TRANSCRIPTION_SIZE = 50 * OneMB;
