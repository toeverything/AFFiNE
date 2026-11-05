import type { PluginListenerHandle } from '@capacitor/core';

/**
 * Native input kind derived from `UITouch.TouchType`.
 *
 * `pencil` is Apple Pencil; `finger` is a direct touch (which also covers palm
 * contact, since iOS has no dedicated palm type); `indirect` is trackpad/pointer.
 */
export type TouchKind = 'pencil' | 'finger' | 'indirect' | 'unknown';

export type TouchPhase = 'began' | 'ended' | 'cancelled';

export interface ClassifiedTouch {
  /** Stable per-touch id for the lifetime of the touch sequence. */
  id: number;
  kind: TouchKind;
  phase: TouchPhase;
  /** CSS-pixel coordinates aligned with the web PointerEvent space. */
  x: number;
  y: number;
  /** Contact radius; useful as a palm-rejection heuristic for `finger` touches. */
  majorRadius: number;
  timestamp: number;
}

export interface TouchClassifiedEvent {
  touches: ClassifiedTouch[];
}

export interface ScribbleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScribbleWillBeginEvent {
  x: number;
  y: number;
}

/**
 * Forwards native `UITouch.TouchType` classification to the web layer.
 *
 * WKWebView only exposes `pointerType: 'pen' | 'touch' | 'mouse'` and cannot
 * distinguish a palm from a finger, so the whiteboard cannot reliably decide
 * which touches should draw versus pan/zoom versus be discarded. This plugin
 * observes touches natively (without consuming them) and emits their real kind
 * plus contact geometry so the web routing layer can make that decision.
 */
export interface PencilInputPlugin {
  /**
   * Attach the native touch observer to the WKWebView.
   *
   * This recognizer is disabled by default because device testing showed it can
   * freeze WKWebView input after the first Pencil stroke.
   */
  start: (options?: {
    allowUnsafeNativeRecognizer?: boolean;
  }) => Promise<{ value: boolean; disabled?: boolean }>;
  /** Detach the observer. */
  stop: () => Promise<{ value: boolean }>;
  isObserving: () => Promise<{ value: boolean }>;
  /**
   * Keep the native iPadOS Scribble gate in sync with Web editable regions.
   *
   * Coordinates are CSS viewport pixels from `getBoundingClientRect()`, which
   * align with WKWebView point coordinates for the non-zoomed iOS shell.
   */
  updateScribbleState: (options: {
    enabled: boolean;
    nativeInteractionEnabled?: boolean;
    rects: ScribbleRect[];
  }) => Promise<{ value: boolean }>;
  addListener(
    eventName: 'touchClassified',
    listenerFunc: (event: TouchClassifiedEvent) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'scribbleWillBegin',
    listenerFunc: (event: ScribbleWillBeginEvent) => void
  ): Promise<PluginListenerHandle>;
}
