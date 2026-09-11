/**
 * Snapshot blob inventory for the existing blob engine (plan §6.8).
 * Server already GCs unreferenced workspace blobs after a grace period.
 * Widgets must drop stale snapshotBlobId so the indexer can collect them.
 */

export const SNAPSHOT_BLOB_KEYS = [
  'snapshotBlobId',
  'snapshotSvgBlobId',
  'sceneBlobId',
] as const;

export const SNAPSHOT_BLOB_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function isManagedSnapshotId(id?: string | null) {
  if (!id) return false;
  return (
    !id.startsWith('data:') &&
    !id.startsWith('blob:') &&
    !id.startsWith('http:') &&
    !id.startsWith('https:')
  );
}

export function snapshotIdsFromProps(props?: Record<string, unknown> | null) {
  const ids: string[] = [];
  if (!props) return ids;
  for (const key of SNAPSHOT_BLOB_KEYS) {
    const value = props[key];
    if (typeof value === 'string' && isManagedSnapshotId(value)) {
      ids.push(value);
    }
  }
  return ids;
}

export function collectReferencedSnapshotIds(
  models: ReadonlyArray<{ props?: Record<string, unknown> | null }>
) {
  const ids = new Set<string>();
  for (const model of models) {
    for (const id of snapshotIdsFromProps(model.props)) ids.add(id);
  }
  return ids;
}

/** Blob ids that are no longer referenced and older than TTL (if age is known). */
export function staleSnapshotIds(
  listed: ReadonlyArray<{ id: string; createdAt?: number }>,
  referenced: ReadonlySet<string>,
  now = Date.now(),
  ttlMs = SNAPSHOT_BLOB_TTL_MS
) {
  return listed
    .filter(blob => {
      if (referenced.has(blob.id) || !isManagedSnapshotId(blob.id)) {
        return false;
      }
      if (blob.createdAt == null) return true;
      return now - blob.createdAt >= ttlMs;
    })
    .map(blob => blob.id);
}

export function replacedSnapshotId(previous?: string | null, next?: string | null) {
  if (
    previous &&
    next &&
    previous !== next &&
    isManagedSnapshotId(previous)
  ) {
    return previous;
  }
  return;
}

export function snapshotAgeSeconds(createdAt?: number | null, now = Date.now()) {
  if (createdAt == null || !Number.isFinite(createdAt)) return 0;
  return Math.max(0, (now - createdAt) / 1000);
}
