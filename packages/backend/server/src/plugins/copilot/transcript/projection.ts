import type {
  LegacyTranscriptionSegment,
  MeetingSummaryV2,
  NormalizedTranscriptSegment,
  TranscriptionLegacyProjection,
  TranscriptionPayloadV2,
} from './types';

function formatSection(title: string, items: string[]) {
  if (!items.length) {
    return [];
  }

  return [`## ${title}`, ...items.map(item => `- ${item}`)];
}

export function formatTranscriptTime(time: number) {
  const safeTime = Math.max(0, time);
  const totalSeconds = Math.floor(safeTime);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map(part => String(part).padStart(2, '0'))
    .join(':');
}

export function toLegacyTranscriptionSegments(
  segments: NormalizedTranscriptSegment[]
): LegacyTranscriptionSegment[] {
  return segments.map(segment => ({
    speaker: segment.speaker,
    start: segment.start,
    end: segment.end,
    transcription: segment.text,
  }));
}

export function summaryToMarkdown(summaryJson?: MeetingSummaryV2 | null) {
  if (!summaryJson) {
    return null;
  }

  const lines = [
    ...formatSection('Key Points', summaryJson.keyPoints),
    ...formatSection('Decisions', summaryJson.decisions),
    ...formatSection('Open Questions', summaryJson.openQuestions),
    ...formatSection('Blockers', summaryJson.blockers),
  ].filter(Boolean);

  const markdown = lines.join('\n').trim();
  return markdown.length ? markdown : null;
}

export function actionItemsToMarkdown(summaryJson?: MeetingSummaryV2 | null) {
  if (!summaryJson?.actionItems.length) {
    return null;
  }

  const markdown = summaryJson.actionItems
    .map(item => {
      const suffix = [item.owner, item.deadline].filter(Boolean).join(' · ');
      return `- [ ] ${item.description}${suffix ? ` (${suffix})` : ''}`;
    })
    .join('\n')
    .trim();

  return markdown.length ? markdown : null;
}

export function buildLegacyProjection(
  payload: Pick<TranscriptionPayloadV2, 'normalizedSegments' | 'summaryJson'>
): TranscriptionLegacyProjection {
  const normalizedSegments = payload.normalizedSegments ?? [];

  return {
    title: payload.summaryJson?.title ?? null,
    summary: summaryToMarkdown(payload.summaryJson),
    actions: actionItemsToMarkdown(payload.summaryJson),
    transcription: normalizedSegments.length
      ? toLegacyTranscriptionSegments(normalizedSegments)
      : null,
  };
}
