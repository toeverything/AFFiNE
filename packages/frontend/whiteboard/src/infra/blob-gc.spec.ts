import { describe, expect, it } from 'vitest';

import {
  collectReferencedSnapshotIds,
  replacedSnapshotId,
  SNAPSHOT_BLOB_TTL_MS,
  snapshotAgeSeconds,
  staleSnapshotIds,
} from './blob-gc';

describe('snapshot blob GC', () => {
  it('keeps live snapshot ids and flags replaced / TTL-expired blobs', () => {
    const referenced = collectReferencedSnapshotIds([
      { props: { snapshotBlobId: 'live-1', sceneBlobId: 'data:skip' } },
      { props: { snapshotSvgBlobId: 'live-2' } },
    ]);
    expect([...referenced].sort()).toEqual(['live-1', 'live-2']);
    expect(replacedSnapshotId('old', 'new')).toBe('old');
    expect(replacedSnapshotId('same', 'same')).toBeUndefined();

    const now = SNAPSHOT_BLOB_TTL_MS + 10;
    expect(
      staleSnapshotIds(
        [
          { id: 'live-1', createdAt: 0 },
          { id: 'orphan-old', createdAt: 0 },
          { id: 'orphan-fresh', createdAt: now },
        ],
        referenced,
        now
      )
    ).toEqual(['orphan-old']);
    expect(snapshotAgeSeconds(now - 2500, now)).toBeCloseTo(2.5);
  });
});
