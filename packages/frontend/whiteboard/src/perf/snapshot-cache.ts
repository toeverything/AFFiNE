const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;

type CacheEntry = {
  url: string;
  bytes: number;
  lastUsed: number;
};

/**
 * Shared blob-id → object URL cache with a memory LRU (plan §6.5).
 * Preview / L0 widgets must go through this instead of unbounded createObjectURL.
 */
export class SnapshotCache {
  readonly maxBytes: number;

  private readonly entries = new Map<string, CacheEntry>();
  /** Deduplicates concurrent `resolve` calls so one blob yields one object URL. */
  private readonly inFlight = new Map<string, Promise<string | undefined>>();
  private bytes = 0;

  constructor(maxBytes = DEFAULT_MAX_BYTES) {
    this.maxBytes = maxBytes;
  }

  get size() {
    return this.entries.size;
  }

  get byteSize() {
    return this.bytes;
  }

  has(id: string) {
    return this.entries.has(id);
  }

  hasUrl(url?: string) {
    if (!url) return false;
    for (const entry of this.entries.values()) {
      if (entry.url === url) return true;
    }
    return false;
  }

  peek(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.lastUsed = Date.now();
    return entry.url;
  }

  set(id: string, url: string, bytes: number) {
    this.delete(id);
    this.entries.set(id, { url, bytes, lastUsed: Date.now() });
    this.bytes += bytes;
    this.evict();
  }

  delete(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    this.bytes -= entry.bytes;
    if (entry.url.startsWith('blob:')) URL.revokeObjectURL(entry.url);
  }

  clear() {
    // Deleting the current key mid-iteration is well-defined for Map.
    for (const id of this.entries.keys()) this.delete(id);
  }

  async resolve(
    id: string,
    load: () => Promise<Blob | null | undefined>
  ): Promise<string | undefined> {
    const hit = this.peek(id);
    if (hit) return hit;

    const pending = this.inFlight.get(id);
    if (pending) return pending;

    const request = (async () => {
      const blob = await load();
      if (!blob) return undefined;
      // A parallel caller may have populated the entry while we awaited.
      const raced = this.peek(id);
      if (raced) return raced;
      const url = URL.createObjectURL(blob);
      this.set(id, url, blob.size);
      return this.peek(id) ?? url;
    })().finally(() => {
      this.inFlight.delete(id);
    });

    this.inFlight.set(id, request);
    return request;
  }

  private evict() {
    while (this.bytes > this.maxBytes && this.entries.size) {
      let oldestId: string | undefined;
      let oldest = Number.POSITIVE_INFINITY;
      for (const [id, entry] of this.entries) {
        if (entry.lastUsed < oldest) {
          oldest = entry.lastUsed;
          oldestId = id;
        }
      }
      if (!oldestId) break;
      this.delete(oldestId);
    }
  }
}

export const snapshotCache = new SnapshotCache();

export function isInlineSnapshotSrc(value?: string) {
  return (
    !!value &&
    (value.startsWith('data:') ||
      value.startsWith('blob:') ||
      value.startsWith('http:') ||
      value.startsWith('https:'))
  );
}
