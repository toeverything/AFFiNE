import '@affine/core/bootstrap/browser';
import '@affine/core/bootstrap/cleanup';
import './proxy';

import { viewportRuntimeConfig } from '@blocksuite/affine/std/gfx';

// iOS WKWebView terminates the web content process when edgeless compositing
// memory (GPU-side IOSurface tiles) spikes. Two distinct triggers exist:
//   1. Resting canvas pixel memory — bounded by CANVAS_DPR_CAP_BY_ZOOM below.
//   2. The transient GPU/DOM churn of a *fast* gesture at extreme zoom-out,
//      where the whole document composites at once.
//
// These overrides are applied once at module load, before any editor or
// readonly preview mounts, so every Viewport instance is constructed with the
// mobile-safe limits. Setting them at construction (rather than mutating a live
// Viewport afterward) avoids both the race condition and the wrong-instance
// problem that previously left the preview viewport on desktop defaults.
//
// Strategy (multi-layer, stability first):
//   - The dpr cap (below) is the real memory lever: canvas backing-store memory
//     scales with dpr^2, so forcing dpr 1 across the zoom-out range is what
//     keeps the compositing budget bounded and stops the web process crashing.
//   - ZOOM_MIN 0.4 bounds how small content can get (and keeps the live zoom in
//     the dpr-1 bucket); it is a guardrail, not the primary crash fix.
//   - OVERSCAN_RATIO pre-rasterizes a margin around the visible area on the
//     *canvas* path, so a pan/zoom moves into content that is *already* painted
//     instead of blanking out and waiting for the post-gesture refresh. This is
//     what fixes "connectors/elements vanish for 1-2s". Canvas overscan grows
//     backing-store area, so keep it modest and rely on the dpr cap to bound
//     mobile memory.
//   - OVERSCAN_RATIO_BLOCK is the *separate* knob for DOM block mounting, which
//     is expensive: each mounted block is its own composited layer subtree, so
//     enlarging this multiplies resident memory and is what drives the iOS
//     jetsam kill. On-device diagnostics showed the active-block count doubling
//     (~16 → ~32) right before each crash when block mounting shared the wide
//     canvas margin. Kept at 0 so blocks mount on the exact visible bound while
//     connectors still pre-paint via the wider canvas margin above.
viewportRuntimeConfig.ZOOM_MIN = 0.4;
viewportRuntimeConfig.VIEWPORT_REFRESH_PIXEL_THRESHOLD = 60;
viewportRuntimeConfig.VIEWPORT_REFRESH_MAX_INTERVAL = 300;
viewportRuntimeConfig.SKIP_REFRESH_DURING_GESTURE = true;
viewportRuntimeConfig.LOW_ZOOM_GESTURE_ACTIVE_BLOCK_LIMIT = 1;

// Pre-paint a 20% margin on every side of the viewport for the *canvas* render
// path. This keeps nearby connectors/shapes warm during orientation and zoom
// gestures, but trims the backing-store and paint budget versus the previous
// 35% setting so low-zoom survival mode has less work to recover from on iOS.
viewportRuntimeConfig.OVERSCAN_RATIO = 0.2;

// Keep DOM block mounting on the exact visible bound (no overscan). Each mounted
// block adds a composited layer subtree to the WebContent process; widening this
// is what doubled the active-block count (~16 → ~32) and triggered the iOS
// jetsam memory kill in on-device logs. Connectors/elements still pre-paint via
// the generous canvas OVERSCAN_RATIO above, so visibility is preserved without
// paying the block-mounting memory cost.
viewportRuntimeConfig.OVERSCAN_RATIO_BLOCK = 0;

// After a gesture ends, blocks and canvases are repainted once. The default
// 800ms felt sluggish on device (elements/connectors took ~3-4s to settle once
// the trailing 200ms panning/zooming debounce and rescheduling were factored
// in). Shorten the post-gesture refresh so the total settle time — ~200ms
// debounce + this delay — lands under ~500ms. Both the canvas and block timers
// read this same value, so connectors and elements reappear together instead of
// staggered.
viewportRuntimeConfig.POST_GESTURE_REFRESH_DELAY = 220;

// At far-out zoom each block is tiny on screen, so a full retina backing store
// (width * devicePixelRatio) is wasted pixels — and on iOS that waste is what
// pushes WKWebView's compositing budget over the edge and crashes the web
// content process during pan. Cap the canvas backing-store dpr the further out
// we zoom: the smaller the content, the less resolution it needs.
//
// Canvas memory scales with backing-store area and dpr^2. With a fixed viewport
// and overscan ratio, the dpr bucket dominates: on-device diagnostics showed
// zoom 0.4 with dpr 2 hitting ~7.2 mp and crashing on the first fast zoom-out;
// the same scene at dpr 1 sits near ~1.8 mp and is stable. Raising ZOOM_MIN
// alone cannot fix it — it only moves the zoom between buckets.
//
// Therefore force dpr 1 for the entire mobile zoom-out range (zoom < 0.5, which
// covers the 0.4 floor) to keep the compositing budget bounded. Connectors are
// slightly thinner at the floor as a result; stability is the hard requirement
// here, so that trade is accepted. dpr 2 is kept for the near-1.0 range where
// content is large and crispness matters. Buckets are checked low-to-high; the
// first matching `zoom < threshold` wins.
viewportRuntimeConfig.CANVAS_DPR_CAP_BY_ZOOM = [
  [0.5, 1],
  [0.8, 2],
];
