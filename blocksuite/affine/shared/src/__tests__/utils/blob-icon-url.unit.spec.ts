import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { getBlobIconUrl } from '../../utils/blob-icon-url';

const originalCreateObjectURL = URL.createObjectURL;
let urlCounter = 0;

beforeEach(() => {
  urlCounter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${++urlCounter}`);
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  vi.restoreAllMocks();
});

describe('getBlobIconUrl', () => {
  test('shares one fetch and one object URL across callers', async () => {
    const getBlob = vi.fn().mockResolvedValue(new Blob(['x']));

    // two synchronous callers share the in-flight fetch…
    const [first, second] = await Promise.all([
      getBlobIconUrl('icon-shared', getBlob),
      getBlobIconUrl('icon-shared', getBlob),
    ]);
    // …and a later caller hits the cache
    const third = await getBlobIconUrl('icon-shared', getBlob);

    expect(getBlob).toHaveBeenCalledTimes(1);
    expect(first).toBe('blob:mock-1');
    expect(second).toBe('blob:mock-1');
    expect(third).toBe('blob:mock-1');
  });

  test('does not cache a missing blob, so the next caller retries', async () => {
    const getBlob = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(new Blob(['x']));

    await expect(getBlobIconUrl('icon-missing', getBlob)).resolves.toBeNull();
    await expect(getBlobIconUrl('icon-missing', getBlob)).resolves.toBe(
      'blob:mock-1'
    );
    expect(getBlob).toHaveBeenCalledTimes(2);
  });

  test('resolves null on fetch failure and retries on the next call', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const getBlob = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(new Blob(['x']));

    await expect(getBlobIconUrl('icon-failed', getBlob)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalled();
    await expect(getBlobIconUrl('icon-failed', getBlob)).resolves.toBe(
      'blob:mock-1'
    );
    expect(getBlob).toHaveBeenCalledTimes(2);
  });
});
