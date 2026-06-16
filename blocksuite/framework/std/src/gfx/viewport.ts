import {
  Bound,
  clamp,
  type IPoint,
  type IVec,
  Vec,
} from '@blocksuite/global/gfx';
import debounce from 'lodash-es/debounce';
import { BehaviorSubject, debounceTime, Subject } from 'rxjs';

import type { GfxViewportElement } from '.';

function cutoff(value: number, ref: number, sign: number) {
  if (sign > 0 && value > ref) return ref;
  if (sign < 0 && value < ref) return ref;
  return value;
}

export const ZOOM_MAX = 6.0;
export const ZOOM_MIN = 0.1;
export const ZOOM_STEP = 0.25;
export const ZOOM_INITIAL = 1.0;

export const FIT_TO_SCREEN_PADDING = 100;

/**
 * Process-wide defaults applied to every {@link Viewport} at construction.
 *
 * Platforms that need different behavior (e.g. mobile/iOS, which must clamp the
 * zoom floor and defer DOM mutations during gestures to avoid WKWebView process
 * termination) override these once at startup, before any editor mounts. This
 * guarantees both the editor and the readonly preview viewports are born with
 * the same limits — avoiding the race and wrong-instance problems of patching a
 * single Viewport asynchronously after it has already mounted.
 *
 * Desktop leaves these untouched, so its behavior is unchanged.
 */
export const viewportRuntimeConfig = {
  ZOOM_MIN,
  ZOOM_MAX,
  VIEWPORT_REFRESH_PIXEL_THRESHOLD: 18,
  VIEWPORT_REFRESH_MAX_INTERVAL: 120,
  SKIP_REFRESH_DURING_GESTURE: false,
  /**
   * Delay (ms) before the post-gesture refresh repaints canvases and reactivates
   * blocks, used only when {@link SKIP_REFRESH_DURING_GESTURE} is true. The same
   * value drives both the canvas and block refresh timers so they fire together
   * (avoiding the "blocks appear, then connectors" staggered reveal). Desktop
   * never enters that code path, so this is mobile-only.
   */
  POST_GESTURE_REFRESH_DELAY: 800,
  /**
   * Caps the canvas backing-store device-pixel-ratio at low zoom.
   *
   * Each entry is `[zoomThreshold, dprCap]`, sorted ascending by threshold.
   * When the live zoom is below a threshold, the corresponding cap bounds the
   * effective dpr used to size canvases. Far-out zoom makes content tiny on
   * screen, so a full retina backing store is wasted memory — on iOS that waste
   * is what pushes WKWebView past its compositing budget and crashes the web
   * content process during pan/zoom.
   *
   * Empty (the desktop default) means no cap: canvases always use the raw
   * `window.devicePixelRatio`, so desktop behavior is unchanged.
   */
  CANVAS_DPR_CAP_BY_ZOOM: [] as Array<[number, number]>,
  /**
   * Fraction by which the *render/activation* viewport bound is enlarged on
   * every side (see {@link Viewport.overscanViewportBounds}). Pre-painting a
   * margin around the visible area means moderate pan/zoom gestures move into
   * content that is already mounted and rasterized, so it does not blank out
   * and wait for the post-gesture refresh.
   *
   * Memory grows by roughly `(1 + 2 * ratio) ** 2`, so this must stay modest
   * and be paired with a zoom floor + dpr cap on mobile. `0` (desktop default)
   * makes {@link Viewport.overscanViewportBounds} identical to
   * {@link Viewport.viewportBounds}, leaving desktop behavior unchanged.
   *
   * This governs the *canvas* render bound only (see
   * {@link Viewport.overscanViewportBounds}). It enlarges the canvas backing
   * stores, so memory grows with the overscan area. Keep it modest and pair it
   * with the mobile zoom floor + dpr cap so connectors/elements stay painted
   * through a gesture without pushing WKWebView over budget.
   */
  OVERSCAN_RATIO: 0,
  /**
   * Like {@link OVERSCAN_RATIO} but for the *DOM block mounting* bound (see
   * {@link Viewport.overscanBlockBounds}). This one is expensive: every
   * mounted block becomes its own composited layer subtree in the WebContent
   * process, so enlarging it multiplies resident memory and is what pushes the
   * process toward an iOS jetsam kill. Keep this small (or `0`) even when
   * {@link OVERSCAN_RATIO} is generous. `0` (desktop default) leaves block
   * mounting on the exact visible bound, unchanged from upstream.
   */
  OVERSCAN_RATIO_BLOCK: 0,
  /**
   * During low-zoom gesture survival mode, keep only a tiny subset of DOM blocks
   * as real active DOM (selected + a few nearby blocks). `0` keeps the legacy
   * behavior where every viewport block remains visually mounted as `survival`.
   */
  LOW_ZOOM_GESTURE_ACTIVE_BLOCK_LIMIT: 0,
  /**
   * Distance threshold (as a fraction of the viewport's shorter side) used to
   * decide whether an unselected viewport block counts as "nearby" to the
   * current selection during low-zoom gesture survival mode.
   */
  LOW_ZOOM_GESTURE_ACTIVE_DISTANCE_RATIO: 0.35,
};

export function getPostGestureRecoveryDelay({
  isPanning,
  isZooming,
  fallbackDelayMs,
}: {
  isPanning: boolean;
  isZooming: boolean;
  fallbackDelayMs: number;
}) {
  return isPanning || isZooming ? fallbackDelayMs : 0;
}

/**
 * Resolves the effective device-pixel-ratio for canvas backing stores at the
 * given zoom, honoring {@link viewportRuntimeConfig.CANVAS_DPR_CAP_BY_ZOOM}.
 *
 * Returns the raw `window.devicePixelRatio` when no cap applies.
 */
export function getEffectiveDpr(
  zoom: number,
  rawDpr = window.devicePixelRatio
): number {
  const caps = viewportRuntimeConfig.CANVAS_DPR_CAP_BY_ZOOM;
  for (const [zoomThreshold, dprCap] of caps) {
    if (zoom < zoomThreshold) {
      return Math.min(rawDpr, dprCap);
    }
  }
  return rawDpr;
}

export interface ViewportRecord {
  left: number;
  top: number;
  viewportX: number;
  viewportY: number;
  zoom: number;
  viewScale: number;
}

export function clientToModelCoord(
  viewport: ViewportRecord,
  clientCoord: [number, number]
): IVec {
  const { left, top, viewportX, viewportY, zoom, viewScale } = viewport;

  const [clientX, clientY] = clientCoord;
  const viewportInternalX = clientX - left;
  const viewportInternalY = clientY - top;
  const modelX = viewportX + viewportInternalX / zoom / viewScale;
  const modelY = viewportY + viewportInternalY / zoom / viewScale;
  return [modelX, modelY];
}

export class Viewport {
  private _cachedBoundingClientRect: DOMRect | null = null;

  private _cachedOffsetWidth: number | null = null;

  private _resizeObserver: ResizeObserver | null = null;

  private readonly _resizeSubject = new Subject<{
    width: number;
    height: number;
    left: number;
    top: number;
  }>();

  private _isResizing = false;
  private _initialTopLeft: IVec | null = null;

  protected _center: IPoint = { x: 0, y: 0 };

  protected _shell: HTMLElement | null = null;

  protected _element: GfxViewportElement | null = null;

  protected _height = 0;

  protected _left = 0;

  protected _locked = false;

  protected _rafId: number | null = null;

  protected _top = 0;

  protected _width = 0;

  protected _zoom: number = 1.0;

  elementReady = new Subject<GfxViewportElement>();

  sizeUpdated = new Subject<{
    width: number;
    height: number;
    left: number;
    top: number;
  }>();

  resizeStarted = new Subject<{
    width: number;
    height: number;
    left: number;
    top: number;
  }>();

  viewportMoved = new Subject<IVec>();

  viewportUpdated = new Subject<{
    zoom: number;
    center: IVec;
  }>();

  zoomUpdated = new Subject<{
    previousZoom: number;
    zoom: number;
  }>();

  zooming$ = new BehaviorSubject<boolean>(false);
  panning$ = new BehaviorSubject<boolean>(false);

  /**
   * Per-instance override for the maximum zoom. When unset, the value is read
   * dynamically from {@link viewportRuntimeConfig} so that runtime overrides
   * (e.g. iOS mobile-safe limits configured at app startup) always apply,
   * regardless of whether this instance was constructed before or after the
   * override ran.
   */
  private _zoomMaxOverride?: number;

  private _zoomMinOverride?: number;

  get ZOOM_MAX() {
    return this._zoomMaxOverride ?? viewportRuntimeConfig.ZOOM_MAX;
  }

  set ZOOM_MAX(value: number) {
    this._zoomMaxOverride = value;
  }

  get ZOOM_MIN() {
    return this._zoomMinOverride ?? viewportRuntimeConfig.ZOOM_MIN;
  }

  set ZOOM_MIN(value: number) {
    this._zoomMinOverride = value;
  }

  /**
   * Minimum pixel movement before triggering a viewport refresh during panning.
   * Higher values reduce refresh frequency, lowering memory pressure on mobile.
   * Default: 18 (desktop-optimized).
   */
  VIEWPORT_REFRESH_PIXEL_THRESHOLD =
    viewportRuntimeConfig.VIEWPORT_REFRESH_PIXEL_THRESHOLD;

  /**
   * Maximum interval (ms) between viewport refreshes during continuous interaction.
   * Higher values reduce refresh frequency, lowering memory pressure on mobile.
   * Default: 120 (desktop-optimized).
   */
  VIEWPORT_REFRESH_MAX_INTERVAL =
    viewportRuntimeConfig.VIEWPORT_REFRESH_MAX_INTERVAL;

  /**
   * When true, viewport element visibility refreshes are skipped entirely during
   * panning/zooming, deferring all DOM mutations until the gesture ends.
   * Prevents JS main thread blocking that can cause WKWebView process termination.
   * Default: false (desktop behavior unchanged).
   */
  SKIP_REFRESH_DURING_GESTURE =
    viewportRuntimeConfig.SKIP_REFRESH_DURING_GESTURE;

  LOW_ZOOM_GESTURE_ACTIVE_BLOCK_LIMIT =
    viewportRuntimeConfig.LOW_ZOOM_GESTURE_ACTIVE_BLOCK_LIMIT;

  LOW_ZOOM_GESTURE_ACTIVE_DISTANCE_RATIO =
    viewportRuntimeConfig.LOW_ZOOM_GESTURE_ACTIVE_DISTANCE_RATIO;

  private readonly _resetZooming = debounce(() => {
    this.zooming$.next(false);
  }, 200);

  private readonly _resetPanning = debounce(() => {
    this.panning$.next(false);
  }, 200);

  constructor() {
    const subscription = this.elementReady.subscribe(el => {
      this._element = el;
      subscription.unsubscribe();
    });

    this._setupResizeObserver();
  }

  private _setupResizeObserver() {
    this._resizeSubject
      .pipe(debounceTime(200))
      .subscribe(({ width, height, left, top }) => {
        if (!this._shell || !this._initialTopLeft) return;
        this._completeResize(width, height, left, top);
      });
  }

  private _completeResize(
    width: number,
    height: number,
    left: number,
    top: number
  ) {
    if (!this._initialTopLeft) return;

    const [initialTopLeftX, initialTopLeftY] = this._initialTopLeft;
    const newCenterX = initialTopLeftX + width / (2 * this.zoom);
    const newCenterY = initialTopLeftY + height / (2 * this.zoom);

    this.setCenter(newCenterX, newCenterY, false, false);
    this._width = width;
    this._height = height;
    this._left = left;
    this._top = top;
    this._isResizing = false;
    this._initialTopLeft = null;

    this.sizeUpdated.next({
      left,
      top,
      width,
      height,
    });
  }

  private _forceCompleteResize() {
    if (this._isResizing && this._shell) {
      const { width, height, left, top } = this.boundingClientRect;
      this._completeResize(width, height, left, top);
    }
  }

  get boundingClientRect() {
    if (!this._shell) return new DOMRect(0, 0, 0, 0);
    if (!this._cachedBoundingClientRect) {
      this._cachedBoundingClientRect = this._shell.getBoundingClientRect();
    }
    return this._cachedBoundingClientRect;
  }

  get element() {
    return this._element;
  }

  get center() {
    return this._center;
  }

  get centerX() {
    return this._center.x;
  }

  get centerY() {
    return this._center.y;
  }

  get height() {
    return this.boundingClientRect.height;
  }

  get left() {
    return this._left;
  }

  // Does not allow the user to move and zoom the canvas in copilot tool
  get locked() {
    return this._locked;
  }

  set locked(locked: boolean) {
    this._locked = locked;
  }

  /**
   * Note this is different from the zoom property.
   * The editor itself may be scaled by outer container which is common in nested editor scenarios.
   * This property is used to calculate the scale of the editor.
   */
  get viewScale() {
    if (
      !this._shell ||
      this._cachedOffsetWidth === null ||
      this._cachedOffsetWidth === 0
    )
      return 1;
    return this.boundingClientRect.width / this._cachedOffsetWidth;
  }

  get top() {
    return this._top;
  }

  get translateX() {
    return -this.viewportX * this.zoom;
  }

  get translateY() {
    return -this.viewportY * this.zoom;
  }

  get viewportBounds() {
    const { viewportMinXY, viewportMaxXY } = this;

    return Bound.from({
      ...viewportMinXY,
      w: viewportMaxXY.x - viewportMinXY.x,
      h: viewportMaxXY.y - viewportMinXY.y,
    });
  }

  /**
   * Like {@link viewportBounds} but enlarged by
   * {@link viewportRuntimeConfig.OVERSCAN_RATIO} on every side. Used only by
   * the *canvas* render path so that gestures move into already-rasterized
   * vector content instead of blank space. This also enlarges the canvas
   * backing store, so keep the ratio conservative.
   *
   * Hit-testing, selection and other geometry must keep using the exact
   * {@link viewportBounds}; do not substitute this for those.
   */
  get overscanViewportBounds() {
    return this._enlargeBounds(viewportRuntimeConfig.OVERSCAN_RATIO);
  }

  /**
   * Like {@link overscanViewportBounds} but governed by the separate, smaller
   * {@link viewportRuntimeConfig.OVERSCAN_RATIO_BLOCK}. Used only by the *DOM
   * block mounting* path. Expensive: every mounted block adds a composited
   * layer subtree, so this must stay small to keep the WebContent process
   * under the iOS jetsam memory limit even when canvas overscan is generous.
   */
  get overscanBlockBounds() {
    return this._enlargeBounds(viewportRuntimeConfig.OVERSCAN_RATIO_BLOCK);
  }

  private _enlargeBounds(ratio: number) {
    const bounds = this.viewportBounds;

    if (ratio <= 0) {
      return bounds;
    }

    const marginX = bounds.w * ratio;
    const marginY = bounds.h * ratio;

    return new Bound(
      bounds.x - marginX,
      bounds.y - marginY,
      bounds.w + marginX * 2,
      bounds.h + marginY * 2
    );
  }

  get viewportMaxXY() {
    const { centerX, centerY, width, height, zoom } = this;
    return {
      x: centerX + width / 2 / zoom,
      y: centerY + height / 2 / zoom,
    };
  }

  get viewportMinXY() {
    const { centerX, centerY, width, height, zoom } = this;
    return {
      x: centerX - width / 2 / zoom,
      y: centerY - height / 2 / zoom,
    };
  }

  get viewportX() {
    const { centerX, width, zoom } = this;
    return centerX - width / 2 / zoom;
  }

  get viewportY() {
    const { centerY, height, zoom } = this;
    return centerY - height / 2 / zoom;
  }

  get width() {
    return this.boundingClientRect.width;
  }

  get zoom() {
    return this._zoom;
  }

  applyDeltaCenter(deltaX: number, deltaY: number) {
    this.setCenter(this.centerX + deltaX, this.centerY + deltaY);
  }

  clearViewportElement() {
    if (this._resizeObserver && this._shell) {
      this._resizeObserver.unobserve(this._shell);
      this._resizeObserver.disconnect();
    }
    this._resizeObserver = null;
    this._shell = null;
    this._cachedBoundingClientRect = null;
    this._cachedOffsetWidth = null;
  }

  dispose() {
    this.clearViewportElement();
    this.sizeUpdated.complete();
    this.resizeStarted.complete();
    this.viewportMoved.complete();
    this.viewportUpdated.complete();
    this.zoomUpdated.complete();
    this._resizeSubject.complete();
    this.zooming$.complete();
    this.panning$.complete();
  }

  getFitToScreenData(
    bounds?: Bound | null,
    padding: [number, number, number, number] = [0, 0, 0, 0],
    maxZoom = this.ZOOM_MAX,
    fitToScreenPadding = 100
  ) {
    let { centerX, centerY, zoom } = this;

    if (!bounds) {
      return { zoom, centerX, centerY };
    }

    const { x, y, w, h } = bounds;
    const [pt, pr, pb, pl] = padding;
    const { width, height } = this;

    zoom = Math.min(
      (width - fitToScreenPadding - (pr + pl)) / w,
      (height - fitToScreenPadding - (pt + pb)) / h
    );
    zoom = clamp(
      zoom,
      this.ZOOM_MIN,
      clamp(maxZoom, this.ZOOM_MIN, this.ZOOM_MAX)
    );

    centerX = x + (w + pr / zoom) / 2 - pl / zoom / 2;
    centerY = y + (h + pb / zoom) / 2 - pt / zoom / 2;

    return { zoom, centerX, centerY };
  }

  isInViewport(bound: Bound) {
    const viewportBounds = Bound.from(this.viewportBounds);
    return (
      viewportBounds.contains(bound) ||
      viewportBounds.isIntersectWithBound(bound)
    );
  }

  onResize() {
    if (!this._shell) return;

    if (!this._isResizing) {
      this._isResizing = true;
      this._initialTopLeft = this.toModelCoord(0, 0);
    }

    const { left, top, width, height } = this.boundingClientRect;
    this._cachedOffsetWidth = this._shell.offsetWidth;

    this._left = left;
    this._top = top;
    this.resizeStarted.next({
      left,
      top,
      width,
      height,
    });
    this._resizeSubject.next({
      left,
      top,
      width,
      height,
    });
  }

  /**
   * Set the center of the viewport.
   * @param centerX The new x coordinate of the center of the viewport.
   * @param centerY The new y coordinate of the center of the viewport.
   * @param forceUpdate Whether to force complete any pending resize operations before setting the viewport.
   */
  setCenter(
    centerX: number,
    centerY: number,
    forceUpdate = true,
    signalPanning = true
  ) {
    if (forceUpdate && this._isResizing) {
      this._forceCompleteResize();
    }

    this._center.x = centerX;
    this._center.y = centerY;

    const gestureActive = this.panning$.value || this.zooming$.value;

    if (signalPanning) {
      this.panning$.next(true);
    }

    // When SKIP_REFRESH_DURING_GESTURE is active, suppress viewportUpdated
    // emissions during gestures. Heavy subscribers (canvas, DOM visibility,
    // per-block transforms) would otherwise fire on every gesture event.
    // Instead, the viewport-element applies a lightweight container-level
    // CSS transform to keep visuals in sync with zero per-block overhead.
    if (!(this.SKIP_REFRESH_DURING_GESTURE && gestureActive)) {
      this.viewportUpdated.next({
        zoom: this.zoom,
        center: Vec.toVec(this.center) as IVec,
      });
    }
    if (signalPanning) {
      this._resetPanning();
    }
  }

  setRect(left: number, top: number, width: number, height: number) {
    if (this._isResizing) {
      this._left = left;
      this._top = top;
      return;
    }

    this._left = left;
    this._top = top;
    this.sizeUpdated.next({
      left,
      top,
      width,
      height,
    });
  }

  /**
   * Set the viewport to the new zoom and center.
   * @param newZoom The new zoom value.
   * @param newCenter The new center of the viewport.
   * @param smooth Whether to animate the zooming and panning.
   * @param forceUpdate Whether to force complete any pending resize operations before setting the viewport.
   */
  setViewport(
    newZoom: number,
    newCenter = Vec.toVec(this.center),
    smooth = false,
    forceUpdate = true,
    signalGesture = false
  ) {
    // Force complete any pending resize operations if forceUpdate is true
    if (forceUpdate && this._isResizing) {
      this._forceCompleteResize();
    }

    const preZoom = this._zoom;
    if (smooth) {
      const cofficient = preZoom / newZoom;
      if (cofficient === 1) {
        this.smoothTranslate(newCenter[0], newCenter[1], 10, signalGesture);
      } else {
        const center = [this.centerX, this.centerY] as IVec;
        const focusPoint = Vec.mul(
          Vec.sub(newCenter, Vec.mul(center, cofficient)),
          1 / (1 - cofficient)
        );
        this.smoothZoom(newZoom, Vec.toPoint(focusPoint), 10, signalGesture);
      }
    } else {
      this._center.x = newCenter[0];
      this._center.y = newCenter[1];
      this.setZoom(newZoom, undefined, false, forceUpdate, signalGesture);
    }
  }

  /**
   * Set the viewport to fit the bound with padding.
   * @param bound The bound will be zoomed to fit the viewport.
   * @param padding The padding will be applied to the bound after zooming, default is [0, 0, 0, 0],
   *                the value may be reduced if there is not enough space for the padding.
   *                Use decimal less than 1 to represent percentage padding. e.g. [0.1, 0.1, 0.1, 0.1] means 10% padding.
   * @param smooth whether to animate the zooming
   * @param forceUpdate whether to force complete any pending resize operations before setting the viewport
   */
  setViewportByBound(
    bound: Bound,
    padding: [number, number, number, number] = [0, 0, 0, 0],
    smooth = false,
    forceUpdate = true,
    signalGesture = false
  ) {
    let [pt, pr, pb, pl] = padding;

    // Convert percentage padding to absolute values if they are between 0 and 1
    if (pt > 0 && pt < 1) pt *= this.height;
    if (pr > 0 && pr < 1) pr *= this.width;
    if (pb > 0 && pb < 1) pb *= this.height;
    if (pl > 0 && pl < 1) pl *= this.width;

    // Calculate zoom
    let zoom = Math.min(
      (this.width - (pr + pl)) / bound.w,
      (this.height - (pt + pb)) / bound.h
    );

    // Adjust padding if space is not enough
    if (zoom < this.ZOOM_MIN) {
      zoom = this.ZOOM_MIN;
      const totalPaddingWidth = this.width - bound.w * zoom;
      const totalPaddingHeight = this.height - bound.h * zoom;
      pr = pl = Math.max(totalPaddingWidth / 2, 1);
      pt = pb = Math.max(totalPaddingHeight / 2, 1);
    }

    // Ensure zoom does not exceed ZOOM_MAX
    if (zoom > this.ZOOM_MAX) {
      zoom = this.ZOOM_MAX;
    }

    const center = [
      bound.x + (bound.w + pr / zoom) / 2 - pl / zoom / 2,
      bound.y + (bound.h + pb / zoom) / 2 - pt / zoom / 2,
    ] as IVec;

    this.setViewport(zoom, center, smooth, forceUpdate, signalGesture);
  }

  /** This is the outer container of the viewport, which is the host of the viewport element */
  setShellElement(el: HTMLElement) {
    this._shell = el;
    this._cachedBoundingClientRect = el.getBoundingClientRect();
    this._cachedOffsetWidth = el.offsetWidth;

    const { left, top, width, height } = this._cachedBoundingClientRect;
    this.setRect(left, top, width, height);

    this._resizeObserver = new ResizeObserver(() => {
      this._cachedBoundingClientRect = null;
      this._cachedOffsetWidth = null;
      this.onResize();
    });
    this._resizeObserver.observe(el);
  }

  /**
   * Set the viewport to the new zoom.
   * @param zoom The new zoom value.
   * @param focusPoint The point to focus on after zooming, default is the center of the viewport.
   * @param _wheel Legacy parameter kept for call-site compatibility.
   * @param forceUpdate Whether to force complete any pending resize operations before setting the viewport.
   */
  setZoom(
    zoom: number,
    focusPoint?: IPoint,
    _wheel = false,
    forceUpdate = true,
    signalGesture = false
  ) {
    if (forceUpdate && this._isResizing) {
      this._forceCompleteResize();
    }

    const prevZoom = this.zoom;
    focusPoint = (focusPoint ?? this._center) as IPoint;
    this._zoom = clamp(zoom, this.ZOOM_MIN, this.ZOOM_MAX);
    const newZoom = this.zoom;

    const offset = Vec.sub(Vec.toVec(this.center), Vec.toVec(focusPoint));
    const newCenter = Vec.add(
      Vec.toVec(focusPoint),
      Vec.mul(offset, prevZoom / newZoom)
    );
    // Always signal zooming for any real gesture zoom change (pinch or wheel).
    // Programmatic viewport changes should use the normal refresh path without
    // entering low-zoom gesture survival mode.
    if (signalGesture) {
      this.zooming$.next(true);
    }
    this.setCenter(newCenter[0], newCenter[1], forceUpdate, signalGesture);
    this.zoomUpdated.next({ previousZoom: prevZoom, zoom: newZoom });
    // setCenter already emits viewportUpdated, no need to emit again here.
    if (signalGesture) {
      this._resetZooming();
    }
  }

  smoothTranslate(x: number, y: number, numSteps = 10, signalGesture = false) {
    const { center } = this;
    const delta = { x: x - center.x, y: y - center.y };
    const innerSmoothTranslate = () => {
      if (this._rafId) cancelAnimationFrame(this._rafId);
      this._rafId = requestAnimationFrame(() => {
        const step = { x: delta.x / numSteps, y: delta.y / numSteps };
        const nextCenter = {
          x: this.centerX + step.x,
          y: this.centerY + step.y,
        };
        const signX = delta.x > 0 ? 1 : -1;
        const signY = delta.y > 0 ? 1 : -1;
        nextCenter.x = cutoff(nextCenter.x, x, signX);
        nextCenter.y = cutoff(nextCenter.y, y, signY);
        this.setCenter(nextCenter.x, nextCenter.y, true, signalGesture);

        if (nextCenter.x != x || nextCenter.y != y) innerSmoothTranslate();
      });
    };
    innerSmoothTranslate();
  }

  smoothZoom(
    zoom: number,
    focusPoint?: IPoint,
    numSteps = 10,
    signalGesture = false
  ) {
    const delta = zoom - this.zoom;
    if (this._rafId) cancelAnimationFrame(this._rafId);

    const innerSmoothZoom = () => {
      this._rafId = requestAnimationFrame(() => {
        const sign = delta > 0 ? 1 : -1;
        const step = delta / numSteps;
        const nextZoom = cutoff(this.zoom + step, zoom, sign);

        this.setZoom(nextZoom, focusPoint, undefined, true, signalGesture);

        if (nextZoom != zoom) innerSmoothZoom();
      });
    };
    innerSmoothZoom();
  }

  toModelBound(bound: Bound) {
    const { w, h } = bound;
    const [x, y] = this.toModelCoord(bound.x, bound.y);

    return new Bound(x, y, w / this.zoom, h / this.zoom);
  }

  toModelCoord(
    viewX: number,
    viewY: number,
    zoom = this.zoom,
    center?: IPoint
  ): IVec {
    const { viewScale } = this;
    const viewportX = center
      ? center.x - this.width / 2 / zoom
      : this.viewportX;
    const viewportY = center
      ? center.y - this.height / 2 / zoom
      : this.viewportY;

    return [
      viewportX + viewX / zoom / viewScale,
      viewportY + viewY / zoom / viewScale,
    ];
  }

  toModelCoordFromClientCoord([x, y]: IVec): IVec {
    return clientToModelCoord(this, [x, y]);
  }

  toViewBound(bound: Bound) {
    const { w, h } = bound;
    const [x, y] = this.toViewCoord(bound.x, bound.y);

    return new Bound(x, y, w * this.zoom, h * this.zoom);
  }

  toViewCoord(modelX: number, modelY: number): IVec {
    const { viewportX, viewportY, zoom, viewScale } = this;
    return [
      (modelX - viewportX) * zoom * viewScale,
      (modelY - viewportY) * zoom * viewScale,
    ];
  }

  toViewCoordFromClientCoord([x, y]: IVec): IVec {
    const { left, top } = this;
    return [x - left, y - top];
  }

  serializeRecord() {
    return JSON.stringify({
      left: this.left,
      top: this.top,
      viewportX: this.viewportX,
      viewportY: this.viewportY,
      zoom: this.zoom,
      viewScale: this.viewScale,
    });
  }

  deserializeRecord(record?: string) {
    try {
      const result = JSON.parse(record || '{}') as ViewportRecord;
      if (!('zoom' in result)) return null;
      return result;
    } catch (error) {
      console.error('Failed to deserialize viewport record:', error);
      return null;
    }
  }
}
