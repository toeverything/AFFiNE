import { z } from 'zod';

import { OneMB } from '../../../base';

const TranscriptionItemSchema = z.object({
  speaker: z.string(),
  start: z.string(),
  end: z.string(),
  transcription: z.string(),
});

export const TranscriptionSchema = z.array(TranscriptionItemSchema);

export const TranscriptPayloadSchema = z.object({
  transcription: TranscriptionSchema.nullable().optional(),
  summary: z.string().nullable().optional(),
});

export type TranscriptionItem = z.infer<typeof TranscriptionItemSchema>;
export type Transcription = z.infer<typeof TranscriptionSchema>;
export type TranscriptionPayload = z.infer<typeof TranscriptPayloadSchema>;

declare global {
  interface Jobs {
    'copilot.transcript.submit': {
      jobId: string;
      url: string;
      mimeType: string;
    };
    'copilot.summary.submit': {
      jobId: string;
    };
  }
}

export const MAX_TRANSCRIPTION_SIZE = 50 * OneMB;
