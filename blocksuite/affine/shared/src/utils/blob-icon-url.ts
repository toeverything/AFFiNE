/**
 * Resolve a blob id (e.g. a custom icon stored in the workspace blob engine)
 * to an object URL, caching successful results per blob id so every icon
 * instance shares one fetch and one object URL.
 *
 * Only successful, non-null resolutions stay cached: a missing blob (the icon
 * may have been picked on another device while its blob is still syncing) or
 * a failed fetch clears the cache entry so the next render retries. Cached
 * object URLs are intentionally never revoked — the set of distinct custom
 * icons in a workspace is small and they are reused for the whole session.
 */
const blobIconUrlCache = new Map<string, Promise<string | null>>();

export function getBlobIconUrl(
  blobId: string,
  getBlob: (blobId: string) => Promise<Blob | null>
): Promise<string | null> {
  let url = blobIconUrlCache.get(blobId);
  if (!url) {
    url = getBlob(blobId)
      .then(blob => (blob ? URL.createObjectURL(blob) : null))
      .catch(error => {
        console.error(error);
        return null;
      })
      .then(resolved => {
        if (resolved === null) {
          blobIconUrlCache.delete(blobId);
        }
        return resolved;
      });
    blobIconUrlCache.set(blobId, url);
  }
  return url;
}
