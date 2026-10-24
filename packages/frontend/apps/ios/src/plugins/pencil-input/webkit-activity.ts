import {
  createWebKitPencilActivityTracker,
  pointerInputClassifierRuntime,
} from '@blocksuite/affine/std';

/**
 * Enable Pencil-priority finger-pan via WebKit `pointerType: 'pen'` only.
 *
 * Does NOT attach `TouchClassifyingGestureRecognizer` / call
 * `setupPencilInputClassifier()` — those freeze the page after the first
 * Pencil stroke on device. Palm rejection stays unavailable until a non-GR
 * native path exists.
 */
export function setupWebKitPencilActivityTracker(): () => void {
  const tracker = createWebKitPencilActivityTracker();
  pointerInputClassifierRuntime.classifier = tracker;

  const onPointer = (event: PointerEvent) => {
    tracker.note(event);
  };

  // Capture so edgeless host / tools see the same stream order.
  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('pointermove', onPointer, true);
  document.addEventListener('pointerup', onPointer, true);
  document.addEventListener('pointercancel', onPointer, true);

  return () => {
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('pointermove', onPointer, true);
    document.removeEventListener('pointerup', onPointer, true);
    document.removeEventListener('pointercancel', onPointer, true);
    if (pointerInputClassifierRuntime.classifier === tracker) {
      pointerInputClassifierRuntime.classifier = null;
    }
  };
}
