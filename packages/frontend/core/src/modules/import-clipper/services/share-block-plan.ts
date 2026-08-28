import type { EmbedCardStyle } from '@blocksuite/affine/model';

import type { ShareImportInput } from './import';

export interface ShareBlockPlanNode {
  flavour: string;
  props: Record<string, unknown>;
  children?: ShareBlockPlanNode[];
}

export interface ShareEmbedOptions {
  flavour: string;
  styles: EmbedCardStyle[];
}

function normalized(value: string | undefined) {
  return value?.replaceAll(/\s+/g, ' ').trim().toLowerCase() ?? '';
}

function timestamp(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = value % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${remainder
        .toString()
        .padStart(2, '0')}`
    : `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function transcriptNodes(input: ShareImportInput) {
  const transcript = input.preview?.transcript;
  if (!transcript) return [];

  const duplicates = new Set([
    normalized(input.preview?.description),
    normalized(input.content.text),
  ]);
  duplicates.delete('');
  const segments = transcript.segments.filter(segment => {
    const text = normalized(segment.text);
    return text && !duplicates.has(text);
  });
  if (
    segments.length === 0 ||
    duplicates.has(normalized(segments.map(segment => segment.text).join(' ')))
  ) {
    return [];
  }

  const chapters = [...(transcript.chapters ?? [])]
    .filter(chapter => chapter.title.trim())
    .sort((left, right) => left.startSeconds - right.startSeconds);
  const children: ShareBlockPlanNode[] = [
    {
      flavour: 'affine:paragraph',
      props: { type: 'h6', text: 'Transcript', collapsed: true },
    },
  ];
  let chapterIndex = 0;
  for (const segment of segments) {
    const segmentStart = segment.startSeconds ?? 0;
    while (
      chapterIndex < chapters.length &&
      chapters[chapterIndex].startSeconds <= segmentStart
    ) {
      children.push({
        flavour: 'affine:paragraph',
        props: { type: 'h6', text: chapters[chapterIndex].title },
      });
      chapterIndex += 1;
    }
    const prefix = [
      segment.startSeconds === undefined
        ? undefined
        : `[${timestamp(segment.startSeconds)}]`,
      segment.speaker?.trim() ? `${segment.speaker.trim()}:` : undefined,
    ]
      .filter(Boolean)
      .join(' ');
    children.push({
      flavour: 'affine:paragraph',
      props: {
        type: 'text',
        text: prefix ? `${prefix} ${segment.text.trim()}` : segment.text.trim(),
      },
    });
  }

  return [
    {
      flavour: 'affine:callout',
      props: {
        icon: { type: 'emoji', unicode: '💬' },
        backgroundColorName: 'grey',
      },
      children,
    },
  ];
}

export function createShareBlockPlan(
  input: ShareImportInput,
  embedOptions: ShareEmbedOptions | null
) {
  if (input.content.kind !== 'url' || !input.content.url) return [];

  const preview = input.preview;
  const primary: ShareBlockPlanNode = embedOptions
    ? {
        flavour: embedOptions.flavour,
        props: { url: input.content.url, style: embedOptions.styles[0] },
      }
    : {
        flavour: 'affine:bookmark',
        props: {
          url: input.content.url,
          title: preview?.title,
          description: preview?.description,
          icon: preview?.favicons?.[0],
          image: preview?.images?.[0],
          style: 'horizontal',
        },
      };
  const selectedText = input.content.text?.trim();

  return [
    primary,
    ...(selectedText
      ? [
          {
            flavour: 'affine:paragraph',
            props: { type: 'quote', text: selectedText },
          },
        ]
      : []),
    ...transcriptNodes(input),
  ];
}
