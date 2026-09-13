import { z } from 'zod';

import type { ShareLinkPreview } from './types';

const maxResponseBytes = 512 * 1024;
const encoder = new TextEncoder();
const text = (bytes: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine(value => encoder.encode(value).byteLength <= bytes);
const webURL = text(8192)
  .pipe(z.string().url())
  .refine(value => {
    try {
      const url = new URL(value);
      return (
        /^https?:\/\//.test(value) &&
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  });
const time = z
  .number()
  .min(0)
  .max(7 * 24 * 60 * 60);
const previewSchema = z.object({
  url: webURL,
  title: text(4096).optional(),
  siteName: text(512).optional(),
  description: text(32768).optional(),
  images: z.array(webURL).max(8).optional(),
  favicons: z.array(webURL).max(8).optional(),
  mediaType: text(256).optional(),
  provider: text(256).optional(),
  author: z
    .object({
      name: text(512),
      handle: text(512).optional(),
      avatar: webURL.optional(),
    })
    .optional(),
  publishedAt: text(128).optional(),
  durationSeconds: time.optional(),
  transcript: z
    .object({
      language: text(128).optional(),
      segments: z
        .array(
          z.object({
            text: text(16384),
            startSeconds: time.optional(),
            durationSeconds: time.optional(),
            speaker: text(512).optional(),
          })
        )
        .max(500),
      chapters: z
        .array(
          z.object({
            title: text(4096),
            startSeconds: time,
          })
        )
        .max(100)
        .optional(),
      truncated: z.boolean().optional(),
    })
    .optional(),
}) satisfies z.ZodType<ShareLinkPreview>;

export function parseShareLinkPreview(
  value: unknown
): ShareLinkPreview | undefined {
  const result = previewSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export async function readShareLinkPreview(response: Response) {
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
      if (bytes > maxResponseBytes) {
        await reader.cancel();
        throw new Error('Link preview response too large');
      }
      json += decoder.decode(value, { stream: true });
    }
    json += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  const preview = parseShareLinkPreview(JSON.parse(json));
  if (!preview) throw new Error('Invalid link preview response');
  return preview;
}
