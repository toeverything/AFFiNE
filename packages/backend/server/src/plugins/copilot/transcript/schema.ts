import { z } from 'zod';

import { buildLegacyProjection } from './projection';

export const LegacyTranscriptionSegmentSchema = z.object({
  speaker: z.string(),
  start: z.string(),
  end: z.string(),
  transcription: z.string(),
});

export const LegacyTranscriptionSchema = z.array(
  LegacyTranscriptionSegmentSchema
);

export const AudioBlobInfoSchema = z.object({
  url: z.string(),
  mimeType: z.string(),
  index: z.number().int().nullable().optional(),
});

export const AudioBlobInfosSchema = z.array(AudioBlobInfoSchema);

export const AudioSliceManifestItemSchema = z.object({
  index: z.number().int(),
  fileName: z.string(),
  mimeType: z.string(),
  startSec: z.number(),
  durationSec: z.number(),
  byteSize: z.number().nullable().optional(),
});

export const RawTranscriptSegmentSchema = z.object({
  source: z.literal('asr'),
  sliceIndex: z.number().int(),
  speaker: z.string(),
  startSec: z.number(),
  endSec: z.number(),
  text: z.string(),
});

export const NormalizedTranscriptSegmentSchema = z.object({
  speaker: z.string(),
  startSec: z.number(),
  endSec: z.number(),
  start: z.string(),
  end: z.string(),
  text: z.string(),
});

export const MeetingActionItemSchema = z.object({
  description: z.string(),
  owner: z.string().nullable(),
  deadline: z.string().nullable(),
});

export const MeetingSummaryV2Schema = z.object({
  title: z.string(),
  durationMinutes: z.number(),
  attendees: z.array(z.string()),
  keyPoints: z.array(z.string()),
  actionItems: z.array(MeetingActionItemSchema),
  decisions: z.array(z.string()),
  openQuestions: z.array(z.string()),
  blockers: z.array(z.string()),
});

export const TranscriptionSourceAudioSchema = z.object({
  blobId: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  durationMs: z.number().nullable().optional(),
  sampleRate: z.number().nullable().optional(),
  channels: z.number().nullable().optional(),
});

export const TranscriptionQualitySchema = z.object({
  degraded: z.boolean().nullable().optional(),
  overflowCount: z.number().nullable().optional(),
});

export const TranscriptProviderMetaSchema = z.object({
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
});

export const TranscriptionRetryMetaSchema = z.object({
  skipAsrOnRetry: z.boolean().optional(),
});

export const TranscriptionLegacyProjectionSchema = z.object({
  title: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  actions: z.string().nullable().optional(),
  transcription: LegacyTranscriptionSchema.nullable().optional(),
});

export const TranscriptionPayloadV2Schema = z.object({
  sourceAudio: TranscriptionSourceAudioSchema.optional(),
  quality: TranscriptionQualitySchema.optional(),
  sliceManifest: z.array(AudioSliceManifestItemSchema).optional(),
  infos: AudioBlobInfosSchema.optional(),
  rawSegments: z.array(RawTranscriptSegmentSchema).optional(),
  normalizedSegments: z.array(NormalizedTranscriptSegmentSchema).optional(),
  normalizedTranscript: z.string().nullable().optional(),
  summaryJson: MeetingSummaryV2Schema.nullable().optional(),
  legacy: TranscriptionLegacyProjectionSchema.nullable().optional(),
  providerMeta: TranscriptProviderMetaSchema.nullable().optional(),
  retryMeta: TranscriptionRetryMetaSchema.optional(),
});

export const TranscriptionSubmitInputSchema = TranscriptionPayloadV2Schema.pick(
  {
    sourceAudio: true,
    quality: true,
    sliceManifest: true,
  }
);

export const TranscriptionResponseSchema = z
  .object({
    a: z.string().describe("speaker's name, for example A, B, C"),
    s: z.number().describe('start time(second) of the transcription'),
    e: z.number().describe('end time(second) of the transcription'),
    t: z.string().describe('transcription text'),
  })
  .array();

const LegacyTranscriptPayloadSchema = z
  .object({
    url: z.string().nullable().optional(),
    mimeType: z.string().nullable().optional(),
    infos: AudioBlobInfosSchema.nullable().optional(),
    title: z.string().nullable().optional(),
    summary: z.string().nullable().optional(),
    actions: z.string().nullable().optional(),
    transcription: LegacyTranscriptionSchema.nullable().optional(),
  })
  .refine(
    payload => Object.values(payload).some(value => value !== undefined),
    { message: 'legacy transcript payload must contain known fields' }
  );

type LegacyTranscriptPayload = z.infer<typeof LegacyTranscriptPayloadSchema>;
type CanonicalTranscriptPayload = z.infer<typeof TranscriptionPayloadV2Schema>;

const CanonicalTranscriptPayloadSchema = TranscriptionPayloadV2Schema.refine(
  payload =>
    payload.sourceAudio !== undefined ||
    payload.quality !== undefined ||
    payload.sliceManifest !== undefined ||
    payload.rawSegments !== undefined ||
    payload.normalizedSegments !== undefined ||
    payload.normalizedTranscript !== undefined ||
    payload.summaryJson !== undefined ||
    payload.providerMeta !== undefined ||
    payload.legacy !== undefined,
  {
    message:
      'canonical transcript payload must contain canonical transcript fields',
  }
);

function normalizePayload(
  payload: LegacyTranscriptPayload | CanonicalTranscriptPayload
): CanonicalTranscriptPayload {
  const canonical = CanonicalTranscriptPayloadSchema.safeParse(payload);
  if (canonical.success) {
    return {
      ...canonical.data,
      legacy: buildLegacyProjection(canonical.data),
    };
  }

  const legacy = LegacyTranscriptPayloadSchema.parse(payload);
  const infos = legacy.infos ?? [];
  const mergedInfos = [...infos];
  if (
    legacy.url &&
    legacy.mimeType &&
    !mergedInfos.some(info => info.url === legacy.url)
  ) {
    mergedInfos.unshift({
      url: legacy.url,
      mimeType: legacy.mimeType,
      index: 0,
    });
  }

  return {
    infos: mergedInfos.length ? mergedInfos : undefined,
    legacy: {
      title: legacy.title,
      summary: legacy.summary,
      actions: legacy.actions,
      transcription: legacy.transcription,
    },
  };
}

export const TranscriptPayloadSchema = z.unknown().transform((input, ctx) => {
  const canonical = CanonicalTranscriptPayloadSchema.safeParse(input);
  if (canonical.success) {
    return normalizePayload(canonical.data);
  }

  const legacy = LegacyTranscriptPayloadSchema.safeParse(input);
  if (legacy.success) {
    return normalizePayload(legacy.data);
  }

  const issue = canonical.error.issues[0] ??
    legacy.error.issues[0] ?? {
      code: z.ZodIssueCode.custom,
      message: 'invalid transcript payload',
    };

  ctx.addIssue(issue);
  return z.NEVER;
}) as z.ZodType<CanonicalTranscriptPayload>;
