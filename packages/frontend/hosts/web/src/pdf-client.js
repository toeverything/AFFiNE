// @ts-check

/**
 * Lazy on-demand client for the pure-Rust `hayro` PDF Web Worker.
 * Spawns zero workers and fetches zero `.wasm` bytes until a caller requests
 * a PDF page count or page render.
 */

/**
 * @typedef {Object} PdfRenderedPage
 * @property {number} pageCount
 * @property {number} widthPx
 * @property {number} heightPx
 * @property {Uint8Array} rgba
 * @property {number} scale
 * @property {boolean} fromCache
 */

/**
 * @typedef {Object} PdfWorkerLike
 * @property {(message: unknown, transfer?: Transferable[]) => void} postMessage
 * @property {(type: string, listener: (event: MessageEvent) => void) => void} addEventListener
 * @property {(type: string, listener: (event: MessageEvent) => void) => void} removeEventListener
 * @property {() => void} [terminate]
 */

/**
 * @typedef {Object} PdfWorkerLoaderLike
 * @property {(kind: 'pdf') => PdfWorkerLike} loadWorker
 * @property {(kind: 'pdf') => boolean} [hasLoadedWorker]
 * @property {(kind: 'pdf') => boolean} [terminateWorker]
 */

const DEFAULT_MAX_CACHE_BYTES = 16 * 1024 * 1024;
const MIN_RENDER_SCALE = 0.25;
const MAX_RENDER_SCALE = 4;

/**
 * Clamps and normalizes a numeric render scale to match worker rasterization
 * bounds (`[0.25, 4.0]`).
 *
 * @param {number | undefined} scale
 * @returns {number}
 */
function normalizeScale(scale) {
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) {
    return 1;
  }
  const clamped = Math.min(MAX_RENDER_SCALE, Math.max(MIN_RENDER_SCALE, scale));
  return Math.round(clamped * 100) / 100;
}

/**
 * Builds the deterministic cache and deduplication key for a PDF page render.
 *
 * @param {string} docKey
 * @param {number} pageIndex
 * @param {number} scale
 * @returns {string}
 */
export function buildPdfPageCacheKey(docKey, pageIndex, scale) {
  return `${docKey}:${pageIndex}:${normalizeScale(scale)}`;
}

/**
 * Creates a lazy PDF preview client with request multiplexing, in-flight
 * deduplication, Transferable zero-copy RGBA delivery, and byte-bounded LRU
 * eviction for offscreen pages.
 *
 * @param {Object} options
 * @param {PdfWorkerLoaderLike} options.workerLoader
 * @param {number} [options.maxCacheBytes]
 */
export function createPdfPreviewClient(options) {
  const workerLoader = options.workerLoader;
  const maxCacheBytes = Math.max(
    1,
    options.maxCacheBytes ?? DEFAULT_MAX_CACHE_BYTES
  );

  /** @type {PdfWorkerLike | null} */
  let worker = null;
  let disposed = false;
  let nextRequestId = 1;
  let totalCacheBytes = 0;
  let evictions = 0;
  let dedupHits = 0;
  let cacheHits = 0;

  /** @type {Map<number, { resolve: (value: any) => void, reject: (error: Error) => void }>} */
  const pendingRpc = new Map();

  /** @type {Map<string, Promise<PdfRenderedPage>>} */
  const inFlightRenders = new Map();

  /** @type {Map<string, Promise<number>>} */
  const inFlightPageCounts = new Map();

  /** @type {Map<string, number>} */
  const pageCountCache = new Map();

  /** @type {Map<string, { pageCount: number, widthPx: number, heightPx: number, rgba: Uint8Array, scale: number, byteLength: number }>} */
  const lruCache = new Map();

  /** @type {Set<string>} */
  let visibleKeys = new Set();

  /** @param {MessageEvent} event */
  function handleWorkerMessage(event) {
    const msg = event?.data;
    if (!msg || typeof msg !== 'object') {
      return;
    }
    const entry = pendingRpc.get(msg.id);
    if (!entry) {
      return;
    }
    pendingRpc.delete(msg.id);
    if (msg.ok) {
      entry.resolve(msg.result);
    } else {
      entry.reject(new Error(msg.error || 'PDF worker request failed'));
    }
  }

  /** @param {Event} event */
  function handleWorkerError(event) {
    const message =
      /** @type {{ message?: string }} */ (
        /** @type {unknown} */ (event)
      )?.message || 'PDF worker error';
    const err = new Error(message);
    for (const entry of pendingRpc.values()) {
      entry.reject(err);
    }
    pendingRpc.clear();
    if (worker) {
      const deadWorker = worker;
      worker = null;
      deadWorker.removeEventListener('message', handleWorkerMessage);
      deadWorker.removeEventListener('error', handleWorkerError);
      if (typeof workerLoader.terminateWorker === 'function') {
        workerLoader.terminateWorker('pdf');
      }
      deadWorker.terminate?.();
    }
  }

  function ensureWorker() {
    if (disposed) {
      throw new Error('PDF preview client is disposed');
    }
    if (!worker) {
      worker = workerLoader.loadWorker('pdf');
      worker.addEventListener('message', handleWorkerMessage);
      worker.addEventListener('error', handleWorkerError);
    }
    return worker;
  }

  /**
   * Sends one RPC message over the lazily spawned PDF worker.
   *
   * @param {Record<string, unknown>} payload
   * @returns {Promise<any>}
   */
  function sendRpc(payload) {
    const activeWorker = ensureWorker();
    const id = nextRequestId++;
    return new Promise((resolve, reject) => {
      pendingRpc.set(id, { resolve, reject });
      activeWorker.postMessage({ ...payload, id });
    });
  }

  /**
   * Evicts least-recently-used entries until `totalCacheBytes <= maxCacheBytes`.
   * Prefers evicting offscreen keys before visible keys.
   *
   * @param {string} [protectedKey]
   */
  function enforceCacheBudget(protectedKey) {
    if (totalCacheBytes <= maxCacheBytes) {
      return;
    }
    // Pass 1: evict offscreen entries from oldest to newest.
    for (const [key, item] of lruCache.entries()) {
      if (totalCacheBytes <= maxCacheBytes) {
        return;
      }
      if (key === protectedKey || visibleKeys.has(key)) {
        continue;
      }
      lruCache.delete(key);
      totalCacheBytes -= item.byteLength;
      evictions += 1;
    }
    // Pass 2: if still over budget, evict oldest entries except the just-inserted key.
    for (const [key, item] of lruCache.entries()) {
      if (totalCacheBytes <= maxCacheBytes) {
        return;
      }
      if (key === protectedKey) {
        continue;
      }
      lruCache.delete(key);
      totalCacheBytes -= item.byteLength;
      evictions += 1;
    }
  }

  /**
   * Updates the set of currently visible page cache keys so offscreen pages
   * are evicted first under memory pressure.
   *
   * @param {Iterable<string>} keys
   */
  function setVisibleKeys(keys) {
    visibleKeys = new Set(keys);
  }

  /**
   * Returns the page count for a PDF document, lazily spawning `pdf-worker`
   * on the first uncached request.
   *
   * @param {{ docKey: string, pdfBytes: Uint8Array }} params
   * @returns {Promise<number>}
   */
  function getPageCount(params) {
    if (disposed) {
      return Promise.reject(new Error('PDF preview client is disposed'));
    }
    const cached = pageCountCache.get(params.docKey);
    if (cached !== undefined) {
      cacheHits += 1;
      return Promise.resolve(cached);
    }
    const existing = inFlightPageCounts.get(params.docKey);
    if (existing) {
      dedupHits += 1;
      return existing;
    }
    const promise = sendRpc({
      op: 'page_count',
      pdfBytes: params.pdfBytes,
      pageIndex: 0,
    })
      .then(result => {
        const count = Number(result.pageCount ?? 0);
        pageCountCache.set(params.docKey, count);
        return count;
      })
      .finally(() => {
        inFlightPageCounts.delete(params.docKey);
      });
    inFlightPageCounts.set(params.docKey, promise);
    return promise;
  }

  /**
   * Renders one PDF page to RGBA pixels, deduplicating concurrent requests for
   * the same `(docKey, pageIndex, scale)` and caching results under the byte
   * budget.
   *
   * @param {{ docKey: string, pdfBytes: Uint8Array, pageIndex: number, scale?: number }} params
   * @returns {Promise<PdfRenderedPage>}
   */
  function renderPage(params) {
    if (disposed) {
      return Promise.reject(new Error('PDF preview client is disposed'));
    }
    const scale = normalizeScale(params.scale);
    const cacheKey = buildPdfPageCacheKey(
      params.docKey,
      params.pageIndex,
      scale
    );

    const cached = lruCache.get(cacheKey);
    if (cached) {
      if (cached.rgba.byteLength === 0) {
        lruCache.delete(cacheKey);
        totalCacheBytes = Math.max(0, totalCacheBytes - cached.byteLength);
      } else {
        // Refresh LRU recency and return an owned copy so caller transfers cannot empty cache.
        lruCache.delete(cacheKey);
        lruCache.set(cacheKey, cached);
        cacheHits += 1;
        return Promise.resolve({
          pageCount: cached.pageCount,
          widthPx: cached.widthPx,
          heightPx: cached.heightPx,
          rgba: cached.rgba.slice(),
          scale: cached.scale,
          fromCache: true,
        });
      }
    }

    const wrapPrivateResult = shared =>
      shared.then(res => ({
        pageCount: res.pageCount,
        widthPx: res.widthPx,
        heightPx: res.heightPx,
        rgba: res.rgba.slice(),
        scale: res.scale,
        fromCache: false,
      }));

    const inFlight = inFlightRenders.get(cacheKey);
    if (inFlight) {
      dedupHits += 1;
      return wrapPrivateResult(inFlight);
    }

    const sharedPromise = sendRpc({
      pdfBytes: params.pdfBytes,
      pageIndex: params.pageIndex,
      scale,
    })
      .then(result => {
        const rgba =
          result.rgba instanceof Uint8Array
            ? result.rgba
            : new Uint8Array(result.rgba);
        const pageCount = Number(result.pageCount);
        const widthPx = Number(result.widthPx);
        const heightPx = Number(result.heightPx);
        pageCountCache.set(params.docKey, pageCount);

        const byteLength = rgba.byteLength;
        if (byteLength <= maxCacheBytes) {
          const prev = lruCache.get(cacheKey);
          if (prev) {
            totalCacheBytes -= prev.byteLength;
            lruCache.delete(cacheKey);
          }
          lruCache.set(cacheKey, {
            pageCount,
            widthPx,
            heightPx,
            rgba,
            scale,
            byteLength,
          });
          totalCacheBytes += byteLength;
          enforceCacheBudget(cacheKey);
        }

        return {
          pageCount,
          widthPx,
          heightPx,
          rgba,
          scale,
          fromCache: false,
        };
      })
      .finally(() => {
        inFlightRenders.delete(cacheKey);
      });

    inFlightRenders.set(cacheKey, sharedPromise);
    return wrapPrivateResult(sharedPromise);
  }

  /**
   * Terminates the PDF worker, clears cached pixel buffers, and rejects any
   * remaining pending RPCs.
   */
  function dispose() {
    if (disposed) {
      return;
    }
    disposed = true;
    const err = new Error('PDF preview client disposed');
    for (const entry of pendingRpc.values()) {
      entry.reject(err);
    }
    pendingRpc.clear();
    inFlightRenders.clear();
    inFlightPageCounts.clear();
    pageCountCache.clear();
    lruCache.clear();
    visibleKeys.clear();
    totalCacheBytes = 0;

    if (worker) {
      worker.removeEventListener('message', handleWorkerMessage);
      worker.removeEventListener('error', handleWorkerError);
      if (typeof workerLoader.terminateWorker === 'function') {
        workerLoader.terminateWorker('pdf');
      } else {
        worker.terminate?.();
      }
      worker = null;
    }
  }

  return Object.freeze({
    getPageCount,
    renderPage,
    setVisibleKeys,
    dispose,
    getStats: () => ({
      workerSpawned: worker !== null,
      disposed,
      activeRequests: pendingRpc.size,
      cacheEntries: lruCache.size,
      cacheBytes: totalCacheBytes,
      maxCacheBytes,
      evictions,
      dedupHits,
      cacheHits,
    }),
  });
}
