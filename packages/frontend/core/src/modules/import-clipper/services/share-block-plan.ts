import type { EmbedCardStyle } from '@blocksuite/affine/model';

import type { ShareImportInput } from './import';

export interface ShareBlockPlanNode {
  id: string;
  flavour: string;
  props: Record<string, unknown>;
  children?: ShareBlockPlanNode[];
}

export interface ShareEmbedOptions {
  flavour: string;
  styles: EmbedCardStyle[];
}

export function shareImportBlockIds(importAttemptId: string) {
  const prefix = `share-${importAttemptId}`;
  return {
    page: `${prefix}-page`,
    surface: `${prefix}-surface`,
    note: `${prefix}-note`,
    bookmark: `${prefix}-bookmark`,
    selectedText: `${prefix}-selected-text`,
    sourceLink: `${prefix}-source-link`,
    image: `${prefix}-image`,
    attachment: `${prefix}-attachment`,
    metadata: `${prefix}-metadata`,
    transcript: `${prefix}-transcript`,
    transcriptHeading: `${prefix}-transcript-heading`,
    transcriptChapter: (originalIndex: number) =>
      `${prefix}-transcript-chapter-${originalIndex}`,
    transcriptSegment: (originalIndex: number) =>
      `${prefix}-transcript-segment-${originalIndex}`,
  };
}

function normalizedWhitespace(value: string | undefined) {
  return (
    value
      ?.split(/\p{White_Space}+/u)
      .filter(Boolean)
      .join(' ') ?? ''
  );
}

function normalizedComparison(value: string | undefined) {
  return normalizedWhitespace(value).toLowerCase();
}

function boundedTime(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function formatTimestamp(value: number) {
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `[${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`
    : `[${minutes}:${String(seconds).padStart(2, '0')}]`;
}

function metadataText(input: ShareImportInput) {
  const preview = input.preview;
  if (!preview) return undefined;
  const provider = normalizedWhitespace(preview.provider);
  const providerName =
    provider.toLowerCase() === 'youtube'
      ? 'YouTube'
      : provider.toLowerCase() === 'x'
        ? 'X'
        : provider;
  const author = normalizedWhitespace(preview.author?.name);
  const duration = boundedTime(preview.durationSeconds);
  const values = [
    providerName,
    author,
    duration === undefined ? '' : formatTimestamp(duration).slice(1, -1),
  ].filter(Boolean);
  return values.length > 0 ? values.join(' · ') : undefined;
}

function transcriptNode(
  input: ShareImportInput
): ShareBlockPlanNode | undefined {
  const transcript = input.preview?.transcript;
  if (!transcript) return undefined;
  const duplicates = new Set(
    [input.content.text, input.preview?.description]
      .map(normalizedComparison)
      .filter(Boolean)
  );
  const segments = transcript.segments
    .slice(0, 500)
    .map((segment, originalIndex) => ({
      originalIndex,
      text: normalizedWhitespace(segment.text),
      speaker: normalizedWhitespace(segment.speaker),
      startSeconds: boundedTime(segment.startSeconds),
    }))
    .filter(segment => {
      const normalized = segment.text.toLowerCase();
      return !!normalized && !duplicates.has(normalized);
    });
  if (
    segments.length === 0 ||
    duplicates.has(
      normalizedComparison(segments.map(segment => segment.text).join(' '))
    )
  ) {
    return undefined;
  }

  const ids = shareImportBlockIds(input.importAttemptId);
  const children: ShareBlockPlanNode[] = [
    {
      id: ids.transcriptHeading,
      flavour: 'affine:paragraph',
      props: { type: 'h6', text: 'Transcript', collapsed: true },
    },
  ];
  const chapters = (transcript.chapters ?? [])
    .slice(0, 100)
    .map((chapter, originalIndex) => ({
      originalIndex,
      title: normalizedWhitespace(chapter.title),
      startSeconds: boundedTime(chapter.startSeconds),
    }))
    .filter(
      (
        chapter
      ): chapter is {
        originalIndex: number;
        title: string;
        startSeconds: number;
      } => !!chapter.title && chapter.startSeconds !== undefined
    )
    .sort(
      (left, right) =>
        left.startSeconds - right.startSeconds ||
        left.originalIndex - right.originalIndex
    );
  let chapterIndex = 0;
  const addChapter = (chapter: (typeof chapters)[number]) => {
    children.push({
      id: ids.transcriptChapter(chapter.originalIndex),
      flavour: 'affine:paragraph',
      props: {
        type: 'text',
        text: `${formatTimestamp(chapter.startSeconds)} ${chapter.title}`,
      },
    });
  };
  for (const segment of segments) {
    if (segment.startSeconds !== undefined) {
      while (chapterIndex < chapters.length) {
        const chapter = chapters[chapterIndex];
        if (!chapter || chapter.startSeconds > segment.startSeconds) {
          break;
        }
        addChapter(chapter);
        chapterIndex++;
      }
    }
    const prefix = [
      segment.startSeconds === undefined
        ? ''
        : formatTimestamp(segment.startSeconds),
      segment.speaker ? `${segment.speaker}:` : '',
    ]
      .filter(Boolean)
      .join(' ');
    children.push({
      id: ids.transcriptSegment(segment.originalIndex),
      flavour: 'affine:paragraph',
      props: {
        type: 'text',
        text: prefix ? `${prefix} ${segment.text}` : segment.text,
      },
    });
  }
  while (chapterIndex < chapters.length) {
    const chapter = chapters[chapterIndex];
    if (!chapter) {
      break;
    }
    addChapter(chapter);
    chapterIndex++;
  }
  return {
    id: ids.transcript,
    flavour: 'affine:callout',
    props: { backgroundColorName: 'grey' },
    children,
  };
}

export function validatesStableBlock(
  existing:
    | { flavour: string; parentId?: string; props?: Record<string, unknown> }
    | undefined,
  expected: { flavour: string; parentId?: string }
) {
  return (
    !existing ||
    (existing.flavour === expected.flavour &&
      (expected.parentId === undefined ||
        existing.parentId === expected.parentId))
  );
}

export function reconcileShareTitles({
  rootTitle,
  pageTitle,
  importTitle,
}: {
  rootTitle: string;
  pageTitle: string;
  importTitle: string;
}) {
  const root = rootTitle.trim();
  const page = pageTitle.trim();
  if (root && page) return { rootTitle, pageTitle };
  const title = root || page || importTitle.trim();
  return {
    rootTitle: root ? rootTitle : title,
    pageTitle: page ? pageTitle : title,
  };
}

export function mergeShareDestinationMetadata({
  existingTagIds,
  requestedTagIds,
  existingCollectionIds,
  requestedCollectionId,
}: {
  existingTagIds: Iterable<string>;
  requestedTagIds: Iterable<string>;
  existingCollectionIds: Iterable<string>;
  requestedCollectionId?: string;
}) {
  const tagIds = new Set(existingTagIds);
  for (const id of requestedTagIds) tagIds.add(id);
  const collectionIds = new Set(existingCollectionIds);
  if (requestedCollectionId) collectionIds.add(requestedCollectionId);
  return { tagIds, collectionIds };
}

export function createShareBlockPlan(
  input: ShareImportInput,
  _embedOptions: ShareEmbedOptions | null
) {
  if (input.content.kind !== 'url' || !input.content.url) return [];

  const preview = input.preview;
  const title =
    preview?.title?.trim() ||
    input.title.trim() ||
    (() => {
      try {
        return new URL(input.content.url).hostname;
      } catch {
        return input.content.url;
      }
    })();
  const primary: ShareBlockPlanNode = {
    id: shareImportBlockIds(input.importAttemptId).bookmark,
    flavour: 'affine:bookmark',
    props: {
      url: input.content.url,
      title,
      description: preview?.description,
      icon: preview?.favicons?.[0],
      image: preview?.images?.[0],
      style: 'horizontal',
    },
  };
  const selectedText = input.content.text?.trim();
  const metadata = metadataText(input);
  const transcript = transcriptNode(input);

  return [
    primary,
    ...(metadata
      ? [
          {
            id: shareImportBlockIds(input.importAttemptId).metadata,
            flavour: 'affine:paragraph',
            props: { type: 'text', text: metadata },
          },
        ]
      : []),
    ...(selectedText
      ? [
          {
            id: shareImportBlockIds(input.importAttemptId).selectedText,
            flavour: 'affine:paragraph',
            props: { type: 'quote', text: selectedText },
          },
        ]
      : []),
    ...(transcript ? [transcript] : []),
  ];
}
