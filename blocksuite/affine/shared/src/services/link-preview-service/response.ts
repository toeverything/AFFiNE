import { z } from 'zod';

const text = z
  .string()
  .trim()
  .transform(value => value || undefined);
const webURL = z
  .string()
  .url()
  .pipe(
    z.string().refine(value => {
      const url = new URL(value);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    })
  );
const optionalText = text.optional().catch(undefined);
const time = z.number().finite().nonnegative().optional().catch(undefined);
const urls = z
  .array(webURL.catch(''))
  .transform(values => values.filter(Boolean))
  .optional()
  .catch(undefined);
const segment = z.object({
  text: z.string().trim().min(1),
  startSeconds: time,
  durationSeconds: time,
  speaker: optionalText,
});
const chapter = z.object({
  title: z.string().trim().min(1),
  startSeconds: z.number().finite().nonnegative(),
});

export const LinkPreviewResponseSchema = z.object({
  url: webURL,
  title: optionalText,
  siteName: optionalText,
  description: optionalText,
  images: urls,
  favicons: urls,
  videos: urls,
  mediaType: optionalText,
  contentType: optionalText,
  charset: optionalText,
  provider: z.enum(['youtube', 'x']).optional().catch(undefined),
  author: z
    .object({
      name: z.string().trim().min(1),
      handle: optionalText,
      avatar: webURL.optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
  publishedAt: optionalText,
  durationSeconds: time,
  transcript: z
    .object({
      language: optionalText,
      segments: z
        .array(segment.nullable().catch(null))
        .transform(values => values.filter(value => value !== null)),
      chapters: z
        .array(chapter.nullable().catch(null))
        .transform(values => values.filter(value => value !== null))
        .optional()
        .catch(undefined),
      truncated: z.boolean().optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});

export type LinkPreviewResponseData = z.infer<typeof LinkPreviewResponseSchema>;

export function parseLinkPreviewResponse(
  value: unknown
): LinkPreviewResponseData | undefined {
  const result = LinkPreviewResponseSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export async function readLinkPreviewResponse(
  response: Response,
  maxBytes = 4 * 1024 * 1024
) {
  if (!response.ok || !response.body)
    throw new Error('Link preview unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let json = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error('Link preview response too large');
      }
      json += decoder.decode(value, { stream: true });
    }
    json += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  const data = parseLinkPreviewResponse(JSON.parse(json));
  if (!data) throw new Error('Invalid link preview response');
  return data;
}
