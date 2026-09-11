import { afterEach, describe, expect, it } from 'vitest';

import { SnapshotCache } from './snapshot-cache';

describe('snapshot cache', () => {
  const created: string[] = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    created.length = 0;
  });

  it('reuses object URLs and evicts the oldest when over the byte budget', async () => {
    URL.createObjectURL = blob => {
      const url = `blob:test-${created.length}-${(blob as Blob).size}`;
      created.push(url);
      return url;
    };
    const revoked: string[] = [];
    URL.revokeObjectURL = url => {
      revoked.push(url);
    };

    const cache = new SnapshotCache(30);
    const first = await cache.resolve('a', async () => new Blob(['12345']));
    const again = await cache.resolve('a', async () => new Blob(['ignore']));
    expect(first).toBe(again);
    expect(cache.size).toBe(1);

    await cache.resolve('b', async () => new Blob(['12345678901234567890']));
    await cache.resolve('c', async () => new Blob(['123456789012345']));
    expect(cache.has('a')).toBe(false);
    expect(revoked[0]).toBe(first);
    expect(cache.byteSize).toBeLessThanOrEqual(30);
  });
});
