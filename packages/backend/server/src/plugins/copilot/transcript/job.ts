import { AiJobStatus } from '@prisma/client';

import { TranscriptPayloadSchema } from './schema';
import type { AudioBlobInfos, TranscriptionPayload } from './types';

export type TranscriptionJob = {
  id: string;
  status: AiJobStatus;
  infos?: AudioBlobInfos;
  transcription?: TranscriptionPayload;
};

export function taskStatusToPublicStatus(status: string): AiJobStatus {
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

export function taskToJob(
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
