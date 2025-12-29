type CacheKey = string;

type CacheEntry = {
  key: CacheKey;
  blobId: string;
  pageNum: number;
  width: number;
  height: number;
  scale: number;
  blob: Blob;
};

type CacheParams = {
  blobId: string;
  pageNum: number;
  width: number;
  height: number;
  scale: number;
};

class BitmapLRU {
  private readonly map = new Map<CacheKey, CacheEntry>();

  constructor(private readonly maxEntries: number) {}

  has(key: CacheKey) {
    return this.map.has(key);
  }

  get(key: CacheKey): CacheEntry | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  findReusable(
    params: CacheParams,
    upscaleThreshold: number
  ): CacheEntry | null {
    let best: CacheEntry | null = null;

    for (const entry of this.map.values()) {
      if (
        entry.blobId !== params.blobId ||
        entry.pageNum !== params.pageNum ||
        entry.scale !== params.scale
      ) {
        continue;
      }

      const ratio = Math.max(
        params.width / entry.width,
        params.height / entry.height
      );

      if (ratio > upscaleThreshold) continue;

      if (!best || entry.width * entry.height > best.width * best.height) {
        best = entry;
      }
    }

    if (!best) return null;

    this.map.delete(best.key);
    this.map.set(best.key, best);
    return best;
  }

  set(entry: CacheEntry) {
    if (this.map.has(entry.key)) {
      this.map.delete(entry.key);
    }

    this.map.set(entry.key, entry);

    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value as CacheKey | undefined;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}

const MAX_ENTRIES = 64;
const UPSCALE_THRESHOLD = 1.3;
const QUALITY = 0.72;

const cache = new BitmapLRU(MAX_ENTRIES);

const normalize = (value: number) => Math.round(value);
const toKey = ({
  blobId,
  pageNum,
  width,
  height,
  scale,
}: CacheParams): CacheKey =>
  `${blobId}:${pageNum}:${normalize(width)}:${normalize(height)}:${scale}`;

export async function getReusableBitmap(
  params: CacheParams
): Promise<ImageBitmap | null> {
  const exact = cache.get(toKey(params));
  if (exact) {
    try {
      return await createImageBitmap(exact.blob);
    } catch {
      return null;
    }
  }

  const reusable = cache.findReusable(params, UPSCALE_THRESHOLD);
  if (!reusable) return null;

  try {
    return await createImageBitmap(reusable.blob);
  } catch {
    return null;
  }
}

export async function cacheBitmap(params: CacheParams, bitmap: ImageBitmap) {
  const key = toKey(params);
  if (cache.has(key)) return;

  try {
    const blob = await bitmapToWebp(bitmap);
    if (!blob) return;
    cache.set({ key, ...params, blob });
  } catch (e) {
    console.error('Failed to convert bitmap', e);
  }
}

async function bitmapToWebp(bitmap: ImageBitmap): Promise<Blob | null> {
  const width = bitmap.width;
  const height = bitmap.height;

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({
      type: 'image/webp',
      quality: QUALITY,
    });
  }

  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/webp', QUALITY);
  });
}
