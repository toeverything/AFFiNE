import '@affine/core/bootstrap/browser';
import '@affine/core/bootstrap/cleanup';
import './proxy';

import { viewportRuntimeConfig } from '@blocksuite/affine/std/gfx';

import { setupPencilInputDebug } from './plugins/pencil-input/debug';

// Opt-in native touch-classification logger (no-op unless explicitly enabled).
setupPencilInputDebug();

// iOS WKWebView terminates the web content process when edgeless compositing
// memory (GPU-side IOSurface tiles) spikes. These overrides are applied once at
// module load, before any editor or readonly preview mounts, so every Viewport
// instance is constructed with the mobile-safe limits.
//
// Strategy (multi-layer, stability first):
//   - The dpr cap is the real memory lever: canvas backing-store memory scales
//     with dpr^2, so forcing dpr 1 across the zoom-out range keeps the
//     compositing budget bounded.
//   - ZOOM_MIN 0.4 bounds how small content can get and keeps the live zoom in
//     the dpr-1 bucket.
//   - OVERSCAN_RATIO pre-rasterizes a margin around the visible area on the
//     *canvas* path, so pan/zoom moves into already-painted content instead of
//     blanking out. Canvas overscan is cheap (fixed tile set, more vector ops).
//   - OVERSCAN_RATIO_BLOCK is kept at 0 so blocks mount on the exact visible
//     bound — each mounted block is its own composited layer subtree and
//     widening this triggers iOS jetsam kills.
viewportRuntimeConfig.ZOOM_MIN = 0.4;
viewportRuntimeConfig.VIEWPORT_REFRESH_PIXEL_THRESHOLD = 60;
viewportRuntimeConfig.VIEWPORT_REFRESH_MAX_INTERVAL = 300;
viewportRuntimeConfig.SKIP_REFRESH_DURING_GESTURE = true;

// Pre-paint a 35% margin on every side for canvas culling only.
viewportRuntimeConfig.OVERSCAN_RATIO = 0.35;

// Keep DOM block mounting on the exact visible bound (no overscan).
viewportRuntimeConfig.OVERSCAN_RATIO_BLOCK = 0;

// Shorten post-gesture refresh so total settle time lands under ~500ms.
viewportRuntimeConfig.POST_GESTURE_REFRESH_DELAY = 220;

// Cap canvas backing-store dpr at low zoom to bound compositing memory.
// Force dpr 1 for zoom < 0.5 (covers the 0.4 floor); dpr 2 for zoom < 0.8.
viewportRuntimeConfig.CANVAS_DPR_CAP_BY_ZOOM = [
  [0.5, 1],
  [0.8, 2],
];
