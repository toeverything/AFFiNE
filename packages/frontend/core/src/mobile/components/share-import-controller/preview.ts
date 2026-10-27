import {
  type LinkPreviewResponseData,
  parseLinkPreviewResponse,
  readLinkPreviewResponse,
} from '@blocksuite/affine/shared/services';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function excerpt(value: string | undefined, limit: number) {
  if (!value) return undefined;
  let result = '';
  let count = 0;
  for (const { segment } of segmenter.segment(value)) {
    if (count++ === limit) return result + '…';
    result += segment;
  }
  return result;
}

export function transcriptPreviewText(
  transcript: LinkPreviewResponseData['transcript']
) {
  let text = '';
  for (const segment of transcript?.segments ?? []) {
    // Bound each segment before normalizing whitespace or joining it.
    text +=
      (text ? ' ' : '') +
      (excerpt(segment.text, 241) ?? '').replace(/\s+/g, ' ').trim();
    const preview = excerpt(text, 240);
    if (preview !== text) return preview;
  }
  return text || undefined;
}

function forDisplay(value: LinkPreviewResponseData): LinkPreviewResponseData {
  const transcript = transcriptPreviewText(value.transcript);
  return {
    ...value,
    title: excerpt(value.title, 120),
    siteName: excerpt(value.siteName, 80),
    description: excerpt(value.description, 500),
    images: value.images?.slice(0, 1),
    favicons: value.favicons?.slice(0, 1),
    videos: undefined,
    author: value.author
      ? {
          ...value.author,
          name: excerpt(value.author.name, 80) ?? value.author.name,
        }
      : undefined,
    transcript: transcript
      ? {
          language: value.transcript?.language,
          segments: [{ text: transcript }],
        }
      : undefined,
  };
}

export function parseShareLinkPreview(value: unknown) {
  const parsed = parseLinkPreviewResponse(value);
  return parsed ? forDisplay(parsed) : undefined;
}

export async function readShareLinkPreview(response: Response) {
  return forDisplay(await readLinkPreviewResponse(response, 1024 * 1024));
}
