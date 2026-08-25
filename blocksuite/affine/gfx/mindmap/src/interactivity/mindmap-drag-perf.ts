/**
 * Lightweight mindmap-drag profiler for iPad Pencil freezes.
 * Enable: localStorage.setItem('affine:mindmap-drag-perf', '1')
 * Dump:   window.__affineMindmapDragPerf.dump()
 * Reset:  window.__affineMindmapDragPerf.reset()
 */

type Bucket = {
  count: number;
  totalMs: number;
  maxMs: number;
};

const buckets = new Map<string, Bucket>();
let dragMoveCount = 0;
let dragStartedAt = 0;
let enabledCache: boolean | null = null;

function isEnabled(): boolean {
  // Default-on for Apple mobile so on-device Safari/Capacitor consoles capture
  // timings without a manual localStorage toggle. Desktop stays opt-in.
  if (enabledCache !== null) return enabledCache;
  try {
    const forcedOff = localStorage.getItem('affine:mindmap-drag-perf') === '0';
    const forcedOn = localStorage.getItem('affine:mindmap-drag-perf') === '1';
    if (forcedOff) {
      enabledCache = false;
    } else if (forcedOn) {
      enabledCache = true;
    } else {
      enabledCache =
        typeof navigator !== 'undefined' &&
        /iPad|iPhone|iPod/.test(navigator.userAgent);
    }
  } catch {
    enabledCache = true;
  }
  return enabledCache;
}

function ensureWindowApi() {
  if (typeof window === 'undefined') return;
  const api = {
    enable() {
      try {
        localStorage.setItem('affine:mindmap-drag-perf', '1');
      } catch {
        // ignore
      }
      enabledCache = true;
      console.info('[mindmap-drag-perf] enabled');
    },
    disable() {
      try {
        localStorage.removeItem('affine:mindmap-drag-perf');
      } catch {
        // ignore
      }
      enabledCache = false;
    },
    reset() {
      buckets.clear();
      dragMoveCount = 0;
      dragStartedAt = 0;
    },
    dump() {
      const rows = [...buckets.entries()]
        .map(([name, b]) => ({
          name,
          count: b.count,
          totalMs: Number(b.totalMs.toFixed(2)),
          avgMs: Number((b.totalMs / Math.max(1, b.count)).toFixed(2)),
          maxMs: Number(b.maxMs.toFixed(2)),
        }))
        .sort((a, b) => b.totalMs - a.totalMs);
      const summary = {
        dragMoveCount,
        elapsedMs: dragStartedAt
          ? Number((performance.now() - dragStartedAt).toFixed(2))
          : 0,
        rows,
      };
      console.info('[mindmap-drag-perf]', summary);
      return summary;
    },
  };
  (
    window as unknown as { __affineMindmapDragPerf: typeof api }
  ).__affineMindmapDragPerf = api;
}

ensureWindowApi();

export function mindmapDragPerfMark(name: string, ms: number) {
  if (!isEnabled()) return;
  const bucket = buckets.get(name) ?? { count: 0, totalMs: 0, maxMs: 0 };
  bucket.count += 1;
  bucket.totalMs += ms;
  bucket.maxMs = Math.max(bucket.maxMs, ms);
  buckets.set(name, bucket);
  if (ms >= 16) {
    console.warn(`[mindmap-drag-perf] slow ${name}: ${ms.toFixed(1)}ms`);
  }
}

export function mindmapDragPerfMeasure<T>(name: string, fn: () => T): T {
  if (!isEnabled()) return fn();
  const start = performance.now();
  try {
    return fn();
  } finally {
    mindmapDragPerfMark(name, performance.now() - start);
  }
}

export function mindmapDragPerfOnStart(meta: Record<string, unknown>) {
  if (!isEnabled()) return;
  ensureWindowApi();
  buckets.clear();
  dragMoveCount = 0;
  dragStartedAt = performance.now();
  console.info('[mindmap-drag-perf] drag start', meta);
}

export function mindmapDragPerfOnMove() {
  if (!isEnabled()) return;
  dragMoveCount += 1;
}

export function mindmapDragPerfOnEnd() {
  if (!isEnabled()) return;
  ensureWindowApi();
  const dump =
    (
      window as unknown as { __affineMindmapDragPerf?: { dump: () => unknown } }
    ).__affineMindmapDragPerf?.dump?.() ?? null;
  console.info('[mindmap-drag-perf] drag end', dump);
}
