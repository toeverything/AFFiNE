import type { PointerInputClassifier } from './input-classifier.js';

/** Matches iOS JS classifier grace: short gap between Pencil strokes. */
export const WEBKIT_PENCIL_ACTIVE_GRACE_MS = 700;

export type WebKitPencilActivityTracker = PointerInputClassifier & {
  /** Record a browser pointer event; only `pointerType === 'pen'` counts. */
  note: (event: Pick<PointerEvent, 'pointerType'>) => void;
  /** Test helper / clock override. */
  now: () => number;
  setNow: (fn: () => number) => void;
};

/**
 * Pencil-priority activity from WebKit `pointerType` only — no native GR, no
 * palm classification (`classify` always returns `undefined`).
 *
 * Used on iPad when attaching `TouchClassifyingGestureRecognizer` to WKWebView
 * is unsafe. Enables {@link isPencilInputActive} so finger-pan routing can run
 * while the Pencil is the active instrument (plus a short grace after lift).
 */
export function createWebKitPencilActivityTracker(options?: {
  graceMs?: number;
}): WebKitPencilActivityTracker {
  const graceMs = options?.graceMs ?? WEBKIT_PENCIL_ACTIVE_GRACE_MS;
  let lastPenAt = Number.NEGATIVE_INFINITY;
  let nowFn = () => performance.now();

  return {
    classify: () => undefined,
    isPencilActive: () => nowFn() - lastPenAt <= graceMs,
    note: event => {
      if (event.pointerType === 'pen') {
        lastPenAt = nowFn();
      }
    },
    now: () => nowFn(),
    setNow: fn => {
      nowFn = fn;
    },
  };
}
