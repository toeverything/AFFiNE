import type {
  LegacyTranscriptionSegment,
  MeetingSummaryV2,
  NormalizedTranscriptSegment,
  RawTranscriptSegment,
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

export function normalizeTranscriptSegments(
  rawSegments: RawTranscriptSegment[]
): NormalizedTranscriptSegment[] {
  const normalized: NormalizedTranscriptSegment[] = [];
  const dedupe = new Set<string>();

  const sorted = [...rawSegments].sort((left, right) => {
    return (
      left.startSec - right.startSec ||
      left.endSec - right.endSec ||
      left.sliceIndex - right.sliceIndex
    );
  });

  for (const segment of sorted) {
    const text = segment.text.trim();
    if (!text) {
      continue;
    }

    const previous = normalized.at(-1);
    const startSec = Math.max(previous?.endSec ?? 0, segment.startSec, 0);
    const endSec = Math.max(segment.endSec, startSec);
    if (endSec <= startSec) {
      continue;
    }

    const speaker = segment.speaker.trim() || 'Speaker';
    const key = `${speaker}|${startSec}|${endSec}|${text}`;
    if (dedupe.has(key)) {
      continue;
    }

    dedupe.add(key);
    normalized.push({
      speaker,
      startSec,
      endSec,
      start: formatTranscriptTime(startSec),
      end: formatTranscriptTime(endSec),
      text,
    });
  }

  return normalized;
}

export function buildNormalizedTranscript(
  segments: NormalizedTranscriptSegment[]
) {
  return segments
    .map(segment => `${segment.start} ${segment.speaker}: ${segment.text}`)
    .join('\n')
    .trim();
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
  payload: Pick<
    TranscriptionPayloadV2,
    'legacy' | 'normalizedSegments' | 'summaryJson'
  >
): TranscriptionLegacyProjection {
  const legacy = payload.legacy ?? {};
  const normalizedSegments = payload.normalizedSegments ?? [];

  return {
    title: legacy.title ?? payload.summaryJson?.title ?? null,
    summary: legacy.summary ?? summaryToMarkdown(payload.summaryJson),
    actions: legacy.actions ?? actionItemsToMarkdown(payload.summaryJson),
    transcription:
      legacy.transcription ??
      (normalizedSegments.length
        ? toLegacyTranscriptionSegments(normalizedSegments)
        : null),
  };
}
