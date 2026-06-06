import '@affine/core/bootstrap/browser';
import '@affine/core/bootstrap/cleanup';
import './proxy';

import { viewportRuntimeConfig } from '@blocksuite/affine/std/gfx';

// iOS WKWebView terminates the web content process when edgeless compositing
// memory (GPU-side IOSurface tiles) spikes. Two distinct triggers exist:
//   1. Resting canvas pixel memory — bounded by CANVAS_DPR_CAP_BY_ZOOM below.
//   2. The transient GPU/DOM churn of a *fast* gesture at extreme zoom-out,
//      where the whole document composites at once. This peak — not the
//      resting memory — is what remains, and it can't be eliminated by dpr
//      alone. So the zoom floor is held at a level proven survivable during
//      fast pan/zoom rather than dropped to 0.2.
//
// These overrides are applied once at module load, before any editor or
// readonly preview mounts, so every Viewport instance is constructed with the
// mobile-safe limits. Setting them at construction (rather than mutating a live
// Viewport afterward) avoids both the race condition and the wrong-instance
// problem that previously left the preview viewport on desktop defaults.
viewportRuntimeConfig.ZOOM_MIN = 0.4;
viewportRuntimeConfig.VIEWPORT_REFRESH_PIXEL_THRESHOLD = 60;
viewportRuntimeConfig.VIEWPORT_REFRESH_MAX_INTERVAL = 300;
viewportRuntimeConfig.SKIP_REFRESH_DURING_GESTURE = true;

// At far-out zoom each block is tiny on screen, so a full retina backing store
// (width * devicePixelRatio) is wasted pixels — and on iOS that waste is what
// pushes WKWebView's compositing budget over the edge and crashes the web
// content process during pan. Cap the canvas backing-store dpr the further out
// we zoom: the smaller the content, the less resolution it needs.
//
// The floor is capped at dpr 2 rather than 1. On-canvas line width in device
// pixels is `lineWidth * zoom * dpr`; at the 0.4 floor a dpr of 1 shrinks a
// ~2px connector to ~0.8 device px — below one physical pixel, so antialiasing
// fades thin connectors out entirely. dpr 2 keeps them at ~1.6 device px
// (visible) while still trimming a third of the backing store on dpr-3 devices.
// Buckets are checked low-to-high; the first matching `zoom < threshold` wins.
viewportRuntimeConfig.CANVAS_DPR_CAP_BY_ZOOM = [[0.8, 2]];
