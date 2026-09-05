export const MAX_SHARE_PREVIEW_BLOB_BYTES = 256 * 1024;
export const MAX_SHARE_PREVIEW_SEGMENTS = 500;
export const MAX_SHARE_PREVIEW_CHAPTERS = 100;

const MAX_URL_LENGTH = 8192;
const MAX_TITLE_LENGTH = 4096;
const MAX_DESCRIPTION_LENGTH = 32 * 1024;
const MAX_PROVIDER_LENGTH = 256;
const MAX_LANGUAGE_LENGTH = 128;
const MAX_SEGMENT_TEXT_LENGTH = 16 * 1024;
const MAX_SPEAKER_LENGTH = 512;
const MAX_DURATION_SECONDS = 7 * 24 * 60 * 60;

export interface SharePreviewTranscriptSegment {
  text: string;
  startSeconds?: number;
  durationSeconds?: number;
  speaker?: string;
}

export interface SharePreviewTranscriptChapter {
  title: string;
  startSeconds: number;
}

export interface SharePreviewRecord {
  version: 1;
  sourceUrl: string;
  title?: string;
  description?: string;
  image?: string;
  provider?: string;
  durationSeconds?: number;
  transcript?: {
    language?: string;
    segments: SharePreviewTranscriptSegment[];
    chapters?: SharePreviewTranscriptChapter[];
    truncated?: boolean;
  };
}

export type SharePreviewLoadState =
  | { status: 'loaded'; record: SharePreviewRecord }
  | { status: 'unavailable' };

type BlobGetter = (sourceId: string) => Blob | null | Promise<Blob | null>;

const topLevelKeys = new Set([
  'version',
  'sourceUrl',
  'title',
  'description',
  'image',
  'provider',
  'durationSeconds',
  'transcript',
]);
const transcriptKeys = new Set([
  'language',
  'segments',
  'chapters',
  'truncated',
]);
const segmentKeys = new Set([
  'text',
  'startSeconds',
  'durationSeconds',
  'speaker',
]);
const chapterKeys = new Set(['title', 'startSeconds']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: Set<string>) {
  return Object.keys(value).every(key => keys.has(key));
}

function boundedString(
  value: unknown,
  maxLength: number,
  { allowEmpty = false }: { allowEmpty?: boolean } = {}
): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    (allowEmpty || value.trim().length > 0)
  );
}

function optionalBoundedString(
  value: unknown,
  maxLength: number
): value is string | undefined {
  return value === undefined || boundedString(value, maxLength);
}

function boundedNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_DURATION_SECONDS
  );
}

function optionalBoundedNumber(value: unknown): value is number | undefined {
  return value === undefined || boundedNumber(value);
}

function isHttpUrl(value: unknown) {
  if (!boundedString(value, MAX_URL_LENGTH)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isSegment(value: unknown): value is SharePreviewTranscriptSegment {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, segmentKeys) &&
    boundedString(value.text, MAX_SEGMENT_TEXT_LENGTH) &&
    optionalBoundedNumber(value.startSeconds) &&
    optionalBoundedNumber(value.durationSeconds) &&
    optionalBoundedString(value.speaker, MAX_SPEAKER_LENGTH)
  );
}

function isChapter(value: unknown): value is SharePreviewTranscriptChapter {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, chapterKeys) &&
    boundedString(value.title, MAX_TITLE_LENGTH) &&
    boundedNumber(value.startSeconds)
  );
}

function isTranscript(
  value: unknown
): value is NonNullable<SharePreviewRecord['transcript']> {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, transcriptKeys) ||
    !optionalBoundedString(value.language, MAX_LANGUAGE_LENGTH) ||
    !Array.isArray(value.segments) ||
    value.segments.length > MAX_SHARE_PREVIEW_SEGMENTS ||
    !value.segments.every(isSegment) ||
    (value.chapters !== undefined &&
      (!Array.isArray(value.chapters) ||
        value.chapters.length > MAX_SHARE_PREVIEW_CHAPTERS ||
        !value.chapters.every(isChapter))) ||
    (value.truncated !== undefined && typeof value.truncated !== 'boolean')
  ) {
    return false;
  }
  return true;
}

function parseSharePreviewRecord(value: unknown): SharePreviewRecord {
  if (!isRecord(value)) {
    throw new Error('Invalid share preview record');
  }
  if (value.version !== 1) {
    if (typeof value.version === 'number' && Number.isInteger(value.version)) {
      throw new Error('Unsupported share preview record version');
    }
    throw new Error('Invalid share preview record');
  }
  if (
    !hasOnlyKeys(value, topLevelKeys) ||
    !isHttpUrl(value.sourceUrl) ||
    !optionalBoundedString(value.title, MAX_TITLE_LENGTH) ||
    !optionalBoundedString(value.description, MAX_DESCRIPTION_LENGTH) ||
    (value.image !== undefined && !isHttpUrl(value.image)) ||
    !optionalBoundedString(value.provider, MAX_PROVIDER_LENGTH) ||
    !optionalBoundedNumber(value.durationSeconds) ||
    (value.transcript !== undefined && !isTranscript(value.transcript))
  ) {
    throw new Error('Invalid share preview record');
  }
  return value as unknown as SharePreviewRecord;
}

export async function parseSharePreviewBlob(
  blob: Blob
): Promise<SharePreviewRecord> {
  if (blob.size > MAX_SHARE_PREVIEW_BLOB_BYTES) {
    throw new Error('Share preview Blob exceeds the size limit');
  }
  if (blob.size === 0) {
    throw new Error('Invalid share preview record');
  }
  let value: unknown;
  try {
    value = JSON.parse(await blob.text());
  } catch {
    throw new Error('Invalid share preview record');
  }
  return parseSharePreviewRecord(value);
}

export class SharePreviewRecordLoader {
  private pending?: Promise<SharePreviewLoadState>;

  constructor(
    private readonly sourceId: string | undefined,
    private readonly version: number | undefined,
    private readonly getBlob: BlobGetter
  ) {}

  load(): Promise<SharePreviewLoadState> {
    if (!this.pending) {
      const pending = this.loadOnce();
      this.pending = pending;
      pending.then(
        state => {
          if (state.status === 'unavailable' && this.pending === pending) {
            this.pending = undefined;
          }
        },
        () => {
          if (this.pending === pending) {
            this.pending = undefined;
          }
        }
      );
    }
    return this.pending;
  }

  private async loadOnce(): Promise<SharePreviewLoadState> {
    if (!this.sourceId || this.version !== 1) {
      return { status: 'unavailable' };
    }
    try {
      const blob = await this.getBlob(this.sourceId);
      if (!blob) return { status: 'unavailable' };
      return { status: 'loaded', record: await parseSharePreviewBlob(blob) };
    } catch {
      return { status: 'unavailable' };
    }
  }
}
