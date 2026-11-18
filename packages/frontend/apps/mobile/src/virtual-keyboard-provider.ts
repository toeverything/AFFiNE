import type { VirtualKeyboardProvider } from '@affine/core/mobile/modules/virtual-keyboard';

/**
 * Derives `VirtualKeyboardService.visible$`/`height$` from `visualViewport`
 * `resize`/`scroll` events on the web/PWA mobile app (`packages/frontend/apps/mobile`).
 *
 * Extracted out of `app.tsx` so this event-derivation logic can be unit
 * tested in isolation against synthetic `resize`/`scroll` sequences modeled
 * directly on real on-device captures (see
 * `.planning/debug/keyboard-scroll-noise.md` and
 * `src/__tests__/virtual-keyboard-provider.unit.spec.ts`), without pulling in
 * `app.tsx`'s module-level side effects (worker/store bootstrapping, etc).
 *
 * Only `resize` events are used to compute `visible`/`height`. `scroll`
 * fires for visual-viewport *position* changes (content scroll,
 * focus-follow-scroll, pinch-pan) — never for *size* changes; per the
 * VisualViewport spec, a keyboard show/hide is a dimension change and always
 * fires `resize`. Feeding `scroll` events into this computation was
 * confirmed on-device to produce internally-contradictory readings (a stale
 * `windowInnerHeight` paired with an already-updated `visualViewport.height`,
 * or a spurious nonzero `offsetTop` with no real keyboard change — including
 * negative computed heights), which — because the result is written straight
 * into a CSS var that reserves in-flow layout space — could itself trigger
 * more `scroll` events, compounding into a runaway feedback loop. See
 * `.planning/debug/keyboard-scroll-noise.md` for the two real-device
 * captures this diagnosis is based on.
 *
 * The `[MobileDebugLog] visualViewport-event` logging is deliberately kept
 * for both event types (unchanged) — it is the exact instrumentation that
 * produced those captures, and remains valuable for future on-device
 * diagnosis.
 *
 * keyboard-focus-tabbar-coordination: `window.innerHeight` is not itself a
 * stable "no keyboard" baseline on real iOS Safari — its own dynamic
 * toolbar (URL bar) collapsing/expanding changes `window.innerHeight`
 * independently of the on-screen keyboard, and can do so across a long run
 * of *genuine* `resize` events (not the `scroll` noise the resize-only fix
 * above already filters). `affine-dev-MobileDebugLog-new-row-enter-5.log`
 * captured `visualViewport.height` staying essentially constant (~385, the
 * keyboard's own occupied height was correct and stable) while
 * `window.innerHeight` swung between 539 and 762 and back across ~2 seconds
 * of resize events, producing negative and wildly inconsistent computed
 * heights that got written straight into the keyboard-toolbar/tab-bar's CSS
 * offset — the reported mis-stacking/keyboard-covering-both-bars symptom.
 * Track the largest `window.innerHeight` observed so far (seeded lazily
 * from the first real event this listener sees, not at registration time —
 * registration can happen well before any layout has settled) as a
 * self-calibrating baseline instead of trusting the live, possibly
 * chrome-collapsed value on every event, and never report a negative
 * height.
 *
 * keyboard-focus-tabbar-coordination (round 2): the baseline fix above
 * only guards against `window.innerHeight` instability. Two more real
 * on-device captures (`affine-dev-MobileDebugLog-new-row-enter-6.log` and
 * `..._debug-top-to-bottom-jump-on-row-click-attempt-1.log`) show a
 * SIBLING failure mode — a long run of genuine `resize` events (already
 * passing the resize-only filter) where `visualViewport.height` (the
 * keyboard's own occupied footprint — the one quantity that should only
 * change on a real keyboard open/close/resize) stays rock-steady
 * (sub-pixel jitter only) while `visualViewport.offsetTop` swings by
 * hundreds of pixels as the user scrolls the page with the keyboard open.
 * Feeding that swing straight into the height formula (exactly like the
 * `window.innerHeight` noise fixed above, just via a different input
 * variable) reproduces the same class of bogus, direction-proportional
 * swing in the reported height — the confirmed mechanism behind the
 * "keyboard-toolbar creeps upward while typing" and "lifts away from the
 * keyboard while scrolling, sticks at its own height" reports, and a
 * plausible contributor to the "scrolling to the top jumps back to the
 * bottom" report (the toolbar's reserved spacer height swinging by
 * hundreds of px mid-scroll perturbs the page's own scroll metrics).
 * Only accept a `resize` event as a genuine keyboard transition when
 * `visualViewport.height` itself has changed by more than a small
 * rounding-noise epsilon since the last accepted sample; otherwise keep
 * reporting the last known-good value instead of recomputing from
 * whichever OTHER quantity happened to be noisy on this event.
 *
 * db-row-toolbar-scroll (checkpoint #2): the running max above must not be
 * unbounded. With the keyboard closed, Safari's bottom bar collapsed for
 * a moment (`window.innerHeight` 628 -> 710 = 100lvh -> 628). The never-reset
 * max latched 710 for the rest of the page session, so the toolbar sat 82px
 * above the screen bottom with no keyboard, and 82px above the keyboard
 * once it opened. On every `resize` where the visual viewport exactly fills
 * the layout viewport (`height` == `innerHeight` and `offsetTop` == 0, each
 * within 1px), the keyboard is provably closed, so the max is re-seeded to
 * the live `innerHeight`. The `offsetTop` clause is required: iOS also
 * reports `innerHeight` == `height` during keyboard-open document pans, but
 * always with a large `offsetTop` (checkpoint #1). Known limitation: a
 * spike while the keyboard is open stays latched until the next close.
 *
 * db-row-toolbar-scroll (bug 1): the round-2 gate also swallows *legitimate*
 * offset-only changes. iOS pans the visual viewport without changing its
 * height when it centres a tapped row, on Enter, and on document drags, so
 * the keyboard top's distance from the layout bottom really does change
 * while the reported height stays stale by exactly the pan (on-device: 54-
 * 151px too high after text -> row, 199px behind the keyboard after a drag
 * back). Rather than recomputing per event (the round-2 noise/feedback
 * hazard), recompute once after the viewport has been quiet for
 * `SETTLE_DELAY_MS`, from the then-live values, and only while the keyboard
 * is open and the result differs from the last reported height.
 */
const VISUAL_VIEWPORT_HEIGHT_EPSILON_PX = 1;
const SETTLE_DELAY_MS = 150;

export function createVisualViewportVirtualKeyboardProvider(): VirtualKeyboardProvider {
  return {
    onChange: callback => {
      if (!visualViewport) {
        console.warn('visualViewport is not supported');
        return () => {};
      }

      let maxWindowHeight: number | undefined;
      let lastAcceptedVisualViewportHeight: number | undefined;
      let lastReported: { visible: boolean; height: number } | undefined;
      let settleTimer: ReturnType<typeof setTimeout> | undefined;

      const report = (state: { visible: boolean; height: number }) => {
        lastReported = state;
        callback(state);
      };

      // bug 1: see module doc comment.
      const settle = () => {
        settleTimer = undefined;
        if (!visualViewport || !lastReported?.visible) return;
        const windowHeight = maxWindowHeight ?? window.innerHeight;
        if (windowHeight - visualViewport.height <= 0) return;
        const height = Math.max(
          0,
          windowHeight - visualViewport.height - visualViewport.offsetTop
        );
        if (
          Math.abs(height - lastReported.height) <=
          VISUAL_VIEWPORT_HEIGHT_EPSILON_PX
        ) {
          return;
        }
        report({ visible: true, height });
      };

      const listener = (event: Event) => {
        if (!visualViewport) return;
        if (lastReported?.visible) {
          clearTimeout(settleTimer);
          settleTimer = setTimeout(settle, SETTLE_DELAY_MS);
        }
        maxWindowHeight =
          maxWindowHeight === undefined
            ? window.innerHeight
            : Math.max(maxWindowHeight, window.innerHeight);
        // db-row-toolbar-scroll: re-seed the running max whenever the
        // keyboard is provably closed, so a transient bottom-bar collapse
        // is not latched for the session (see module doc comment). Must run
        // before the round-2 gate, which can swallow the final settle sample.
        if (
          event.type === 'resize' &&
          Math.abs(visualViewport.height - window.innerHeight) <=
            VISUAL_VIEWPORT_HEIGHT_EPSILON_PX &&
          Math.abs(visualViewport.offsetTop) <=
            VISUAL_VIEWPORT_HEIGHT_EPSILON_PX
        ) {
          maxWindowHeight = window.innerHeight;
        }
        const windowHeight = maxWindowHeight;

        /**
         * ┌───────────────┐ - window top
         * │               │
         * │               │
         * │               │
         * │               │
         * │               │
         * └───────────────┘ - keyboard top        --
         * │               │                       │ keyboard height in layout viewport
         * └───────────────┘ - page(html) bottom   --
         * │               │                       │ visualViewport.offsetTop
         * └───────────────┘ - window bottom       --
         */
        const visible = windowHeight - visualViewport.height > 0;
        const height = Math.max(
          0,
          windowHeight - visualViewport.height - visualViewport.offsetTop
        );

        console.debug('[MobileDebugLog] visualViewport-event', {
          type: event.type,
          timestampMs: Date.now(),
          windowInnerHeight: window.innerHeight,
          visualViewportHeight: visualViewport.height,
          visualViewportWidth: visualViewport.width,
          visualViewportOffsetTop: visualViewport.offsetTop,
          visualViewportOffsetLeft: visualViewport.offsetLeft,
          visualViewportScale: visualViewport.scale,
          computedVisible: visible,
          computedHeight: height,
        });

        // `scroll` never carries a legitimate keyboard-size signal, only
        // `resize` does — see module doc comment. Do not feed `scroll` into
        // the visible/height computation.
        if (event.type !== 'resize') return;

        // round 2: a `resize` event whose own `visualViewport.height` did
        // not meaningfully change from the last accepted sample is not a
        // genuine keyboard transition — see module doc comment. Keep
        // reporting the last known-good value rather than one corrupted by
        // whichever OTHER quantity (window.innerHeight, offsetTop) was
        // noisy on this particular event.
        if (
          lastAcceptedVisualViewportHeight !== undefined &&
          Math.abs(visualViewport.height - lastAcceptedVisualViewportHeight) <=
            VISUAL_VIEWPORT_HEIGHT_EPSILON_PX
        ) {
          return;
        }
        lastAcceptedVisualViewportHeight = visualViewport.height;

        report({ visible, height });
      };

      visualViewport.addEventListener('resize', listener);
      visualViewport.addEventListener('scroll', listener);
      return () => {
        clearTimeout(settleTimer);
        visualViewport?.removeEventListener('resize', listener);
        visualViewport?.removeEventListener('scroll', listener);
      };
    },
  };
}
