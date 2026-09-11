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

/** `wb:sketch` keeps embedded image blob ids in a `Boxed` `assets` record. */
export function assetIdsFromProps(props?: Record<string, unknown> | null) {
  const ids: string[] = [];
  const boxed = props?.['assets'] as { getValue?: () => unknown } | undefined;
  const assets =
    typeof boxed?.getValue === 'function' ? boxed.getValue() : boxed;
  if (!assets || typeof assets !== 'object') return ids;
  for (const value of Object.values(assets)) {
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
    for (const id of assetIdsFromProps(model.props)) ids.add(id);
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

/**
 * Blob ids superseded during this session, with the time they were replaced.
 *
 * Widgets overwrite their snapshot on every persist, so the previous id becomes
 * unreferenced immediately. Recording it here lets a sweep find those blobs
 * without walking the whole workspace; the ids are still filtered through
 * `staleSnapshotIds`, because a named version may still point at one.
 */
const superseded = new Map<string, number>();

export function replacedSnapshotId(
  previous?: string | null,
  next?: string | null,
  now = Date.now()
): string | undefined {
  if (!previous || !next || previous === next) return undefined;
  if (!isManagedSnapshotId(previous)) return undefined;
  superseded.set(previous, now);
  return previous;
}

export function supersededSnapshotIds(): ReadonlyMap<string, number> {
  return superseded;
}

export function forgetSupersededSnapshotIds(ids: Iterable<string>) {
  for (const id of ids) superseded.delete(id);
}

/**
 * Session-superseded blobs that are unreferenced and past the TTL, ready to be
 * dropped from the local blob store.
 */
export function sweepSupersededSnapshotIds(
  referenced: ReadonlySet<string>,
  now = Date.now(),
  ttlMs = SNAPSHOT_BLOB_TTL_MS
) {
  return staleSnapshotIds(
    [...superseded].map(([id, createdAt]) => ({ id, createdAt })),
    referenced,
    now,
    ttlMs
  );
}

export function snapshotAgeSeconds(
  createdAt?: number | null,
  now = Date.now()
) {
  if (createdAt == null || !Number.isFinite(createdAt)) return 0;
  return Math.max(0, (now - createdAt) / 1000);
}
