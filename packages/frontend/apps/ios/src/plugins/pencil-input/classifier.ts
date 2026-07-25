import {
  type InputTouchKind,
  type PointerInputClassifier,
  pointerInputClassifierRuntime,
} from '@blocksuite/affine/std';

import type { ClassifiedTouch } from './definitions';
import { PencilInput } from './index';

// A web `pointerdown` is correlated to the most recent native `began` touch
// within this distance (CSS px) and time (ms). The native event crosses the
// Capacitor bridge asynchronously, so the window absorbs small ordering/latency
// differences. No match -> `classify` returns undefined and the caller keeps
// its default `pointerType` behavior.
const MATCH_DISTANCE_PX = 44;
const MATCH_WINDOW_MS = 300;

// A Pencil stays the active instrument briefly after lift so routing can keep
// Pencil-priority behavior across short gaps between consecutive strokes.
const PENCIL_ACTIVE_GRACE_MS = 700;

// Contact radius above which a native `finger` touch is treated as a palm.
// Keep this above normal fingertip radii so Pencil-priority finger pans survive.
const PALM_MAJOR_RADIUS = 45;

interface RecentTouch {
  kind: ClassifiedTouch['kind'];
  x: number;
  y: number;
  majorRadius: number;
  at: number;
}

/**
 * Classifies web pointer events using the native `UITouch.TouchType` stream so
 * the edgeless routing can reject palm contact and keep Apple Pencil strokes
 * alive. Native classification is authoritative; `pointerType` is the fallback.
 */
class NativePointerClassifier implements PointerInputClassifier {
  private readonly _recent: RecentTouch[] = [];
  private readonly _activePencilIds = new Set<number>();
  private _lastPencilAt = 0;

  ingest(touches: ClassifiedTouch[]): void {
    const now = performance.now();
    for (const touch of touches) {
      if (touch.kind === 'pencil') {
        this._lastPencilAt = now;
        if (touch.phase === 'began') {
          this._activePencilIds.add(touch.id);
        } else {
          this._activePencilIds.delete(touch.id);
        }
      }
      if (touch.phase === 'began') {
        this._recent.push({
          kind: touch.kind,
          x: touch.x,
          y: touch.y,
          majorRadius: touch.majorRadius,
          at: now,
        });
      }
    }
    this._prune(now);
  }

  classify(event: PointerEvent): InputTouchKind | undefined {
    const match = this._correlate(event);
    if (match?.kind === 'pencil' || event.pointerType === 'pen') {
      return 'pencil';
    }
    if (event.pointerType !== 'touch') {
      return undefined;
    }
    if (match) {
      return match.majorRadius >= PALM_MAJOR_RADIUS ? 'palm' : 'finger';
    }
    return undefined;
  }

  isPencilActive(): boolean {
    if (this._activePencilIds.size > 0) return true;
    return performance.now() - this._lastPencilAt < PENCIL_ACTIVE_GRACE_MS;
  }

  private _correlate(event: PointerEvent): RecentTouch | undefined {
    const now = performance.now();
    let best: RecentTouch | undefined;
    let bestDistance = MATCH_DISTANCE_PX;
    for (const touch of this._recent) {
      if (now - touch.at > MATCH_WINDOW_MS) continue;
      const distance = Math.hypot(
        touch.x - event.clientX,
        touch.y - event.clientY
      );
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = touch;
      }
    }
    return best;
  }

  private _prune(now: number): void {
    while (
      this._recent.length > 0 &&
      now - this._recent[0].at > MATCH_WINDOW_MS
    ) {
      this._recent.shift();
    }
  }
}

let classifier: NativePointerClassifier | null = null;

/**
 * Start the native touch observer and register the classifier so blocksuite
 * pointer routing can consult it. Idempotent; safe to call once at startup.
 */
export async function setupPencilInputClassifier(): Promise<void> {
  if (classifier) return;
  const instance = new NativePointerClassifier();
  try {
    await PencilInput.start();
    await PencilInput.addListener('touchClassified', event => {
      instance.ingest(event.touches);
    });
    classifier = instance;
    pointerInputClassifierRuntime.classifier = instance;
  } catch (err) {
    console.warn('[pencil-input] failed to start classifier', err);
  }
}
