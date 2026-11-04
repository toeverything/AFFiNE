import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  BLOB_ICON_RETRY_DELAYS_MS,
  getBlobIconUrl,
} from '../../utils/blob-icon-url';

const originalCreateObjectURL = URL.createObjectURL;
let urlCounter = 0;
let blobCounter = 0;

const RETRY_BUDGET_MS = BLOB_ICON_RETRY_DELAYS_MS.reduce(
  (total, delay) => total + delay,
  0
);
const MAX_ATTEMPTS = BLOB_ICON_RETRY_DELAYS_MS.length + 1;

/** Each test gets a fresh blob id, because the cache is module-global. */
function nextBlobId() {
  return `icon-${++blobCounter}`;
}

beforeEach(() => {
  urlCounter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${++urlCounter}`);
  vi.useFakeTimers();
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('getBlobIconUrl', () => {
  test('shares one fetch and one object URL across callers', async () => {
    const blobId = nextBlobId();
    const getBlob = vi.fn().mockResolvedValue(new Blob(['x']));

    // two synchronous callers share the in-flight fetch…
    const [first, second] = await Promise.all([
      getBlobIconUrl(blobId, getBlob),
      getBlobIconUrl(blobId, getBlob),
    ]);
    // …and a later caller hits the cache
    const third = await getBlobIconUrl(blobId, getBlob);

    expect(getBlob).toHaveBeenCalledTimes(1);
    expect(first).toBe('blob:mock-1');
    expect(second).toBe('blob:mock-1');
    expect(third).toBe('blob:mock-1');
  });

  test('retries with backoff until the blob syncs', async () => {
    const blobId = nextBlobId();
    const getBlob = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(new Blob(['x']));

    const pending = getBlobIconUrl(blobId, getBlob);
    expect(getBlob).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(BLOB_ICON_RETRY_DELAYS_MS[0]);
    expect(getBlob).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(BLOB_ICON_RETRY_DELAYS_MS[1]);
    expect(getBlob).toHaveBeenCalledTimes(3);
    await expect(pending).resolves.toBe('blob:mock-1');
  });

  test('treats a fetch failure as a missed attempt and retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const blobId = nextBlobId();
    const getBlob = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(new Blob(['x']));

    const pending = getBlobIconUrl(blobId, getBlob);
    await vi.advanceTimersByTimeAsync(BLOB_ICON_RETRY_DELAYS_MS[0]);

    expect(console.error).toHaveBeenCalledTimes(1);
    expect(getBlob).toHaveBeenCalledTimes(2);
    await expect(pending).resolves.toBe('blob:mock-1');
  });

  test('gives up after the retry budget and does not cache the miss', async () => {
    const blobId = nextBlobId();
    const getBlob = vi.fn().mockResolvedValue(null);

    const pending = getBlobIconUrl(blobId, getBlob);
    await vi.advanceTimersByTimeAsync(RETRY_BUDGET_MS);

    await expect(pending).resolves.toBeNull();
    expect(getBlob).toHaveBeenCalledTimes(MAX_ATTEMPTS);

    // the next caller starts a new cycle instead of reusing the miss
    void getBlobIconUrl(blobId, getBlob);
    expect(getBlob).toHaveBeenCalledTimes(MAX_ATTEMPTS + 1);
  });
});
