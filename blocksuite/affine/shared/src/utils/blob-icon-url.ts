/**
 * Resolve a blob id (e.g. a custom icon stored in the workspace blob engine)
 * to an object URL, caching successful results per blob id so every icon
 * instance shares one fetch and one object URL.
 *
 * A blob that is not available yet is retried with backoff for about two
 * minutes. The icon's table row or block prop usually syncs before the blob
 * itself does (e.g. an icon picked on another device moments ago), and no
 * render is guaranteed while a mounted icon waits, so the retry runs inside
 * the cached promise and resolves the icon as soon as the blob lands. Only
 * successful resolutions stay cached: when the retries run out, or the fetch
 * keeps failing, the entry is cleared so the next render starts a new cycle.
 * Cached object URLs are intentionally never revoked — the set of distinct
 * custom icons in a workspace is small and they are reused for the whole
 * session.
 */
const blobIconUrlCache = new Map<string, Promise<string | null>>();

/** Delay before each retry. One attempt runs before the first delay. */
export const BLOB_ICON_RETRY_DELAYS_MS = [
  1000, 2000, 5000, 10000, 30000, 60000,
];

async function resolveBlobIconUrl(
  blobId: string,
  getBlob: (blobId: string) => Promise<Blob | null>
): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    const blob = await getBlob(blobId).catch((error: unknown) => {
      console.error(error);
      return null;
    });
    if (blob) {
      return URL.createObjectURL(blob);
    }
    const delay = BLOB_ICON_RETRY_DELAYS_MS[attempt];
    if (delay === undefined) {
      return null;
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

export function getBlobIconUrl(
  blobId: string,
  getBlob: (blobId: string) => Promise<Blob | null>
): Promise<string | null> {
  let url = blobIconUrlCache.get(blobId);
  if (!url) {
    url = resolveBlobIconUrl(blobId, getBlob).then(resolved => {
      if (resolved === null) {
        blobIconUrlCache.delete(blobId);
      }
      return resolved;
    });
    blobIconUrlCache.set(blobId, url);
  }
  return url;
}
