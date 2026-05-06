import { z } from 'zod';

import { llmGetContractSchema } from '../../../native';
import { buildStructuredResponseFromSchemaJson } from '../runtime/contracts';

// Owner: DB/job/API legacy compatibility and transcript projection.
// Native owns transcript domain result schemas; this file accepts historical
// nullable/partial payloads used by backend persistence and resolver surfaces.
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

export const TranscriptionLegacyProjectionSchema = z.object({
  title: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  actions: z.string().nullable().optional(),
  transcription: LegacyTranscriptionSchema.nullable().optional(),
});

export const TranscriptionPayloadV2Schema = z.object({
  sourceAudio: TranscriptionSourceAudioSchema.nullable().optional(),
  quality: TranscriptionQualitySchema.nullable().optional(),
  sliceManifest: z.array(AudioSliceManifestItemSchema).nullable().optional(),
  infos: AudioBlobInfosSchema.nullable().optional(),
  normalizedSegments: z
    .array(NormalizedTranscriptSegmentSchema)
    .nullable()
    .optional(),
  normalizedTranscript: z.string().nullable().optional(),
  summaryJson: MeetingSummaryV2Schema.nullable().optional(),
  providerMeta: TranscriptProviderMetaSchema.nullable().optional(),
  version: z.string().optional(),
  strategy: z.string().optional(),
});

export const TranscriptionSubmitInputSchema = TranscriptionPayloadV2Schema.pick(
  {
    sourceAudio: true,
    quality: true,
    sliceManifest: true,
  }
);

function buildRequiredStructuredContract(schema: Record<string, unknown>) {
  const contract = buildStructuredResponseFromSchemaJson(schema);
  if (!contract.responseSchemaJson || !contract.schemaHash) {
    throw new Error('Structured transcript contract is required');
  }

  return {
    responseSchemaJson: contract.responseSchemaJson,
    schemaHash: contract.schemaHash,
  };
}

export const TranscriptActionResultContract = buildRequiredStructuredContract(
  llmGetContractSchema('transcriptGeneratedResult')
);

type CanonicalTranscriptPayload = z.infer<typeof TranscriptionPayloadV2Schema>;

const CanonicalTranscriptPayloadSchema = TranscriptionPayloadV2Schema.refine(
  payload =>
    payload.sourceAudio !== undefined ||
    payload.quality !== undefined ||
    payload.sliceManifest !== undefined ||
    payload.normalizedSegments !== undefined ||
    payload.normalizedTranscript !== undefined ||
    payload.summaryJson !== undefined ||
    payload.providerMeta !== undefined ||
    payload.version !== undefined ||
    payload.strategy !== undefined,
  {
    message:
      'canonical transcript payload must contain canonical transcript fields',
  }
);

export const TranscriptPayloadSchema = z.unknown().transform((input, ctx) => {
  const canonical = CanonicalTranscriptPayloadSchema.safeParse(input);
  if (canonical.success) {
    return canonical.data;
  }

  const issue = canonical.error.issues[0] ?? {
    code: z.ZodIssueCode.custom,
    message: 'invalid transcript payload',
  };

  ctx.addIssue(issue);
  return z.NEVER;
}) as z.ZodType<CanonicalTranscriptPayload>;
