/**
 * Runtime-injectable pointer input classifier.
 *
 * The browser's `PointerEvent.pointerType` only distinguishes `pen` / `touch` /
 * `mouse` and cannot tell a resting palm from a deliberate finger. On platforms
 * that can see the real native touch type (e.g. iPadOS via `UITouch.TouchType`),
 * the host injects a classifier here so the edgeless pointer routing can reject
 * palm contact and keep an Apple Pencil stroke alive while a hand rests on the
 * screen.
 *
 * This mirrors the {@link viewportRuntimeConfig} injection pattern: the framework
 * stays platform-agnostic and simply consults the hook when present. When no
 * classifier is injected (desktop, web, Android) the getter returns `undefined`
 * and pointer handling behaves exactly as before.
 */

export type InputTouchKind = 'pencil' | 'finger' | 'palm';

export interface PointerInputClassifier {
  /**
   * Classify a pointer event using host-native touch information.
   *
   * Returns `undefined` when the host cannot confidently classify the event
   * (e.g. no correlated native touch yet), in which case callers must fall back
   * to their default `pointerType`-based behavior.
   */
  classify: (event: PointerEvent) => InputTouchKind | undefined;

  /**
   * Whether an Apple Pencil is currently in use (down now, or lifted within a
   * short grace window). Lets input routing apply pencil-priority behavior —
   * e.g. finger drags pan the canvas instead of drawing while the Pencil is the
   * active drawing instrument.
   */
  isPencilActive: () => boolean;
}

export const pointerInputClassifierRuntime: {
  classifier: PointerInputClassifier | null;
} = {
  classifier: null,
};

/** Convenience wrapper; safe to call on any platform. */
export function classifyPointerInput(
  event: PointerEvent
): InputTouchKind | undefined {
  return pointerInputClassifierRuntime.classifier?.classify(event);
}

/** Whether an Apple Pencil is currently the active instrument. */
export function isPencilInputActive(): boolean {
  return pointerInputClassifierRuntime.classifier?.isPencilActive() ?? false;
}
