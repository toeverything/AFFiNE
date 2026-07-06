[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [gfx](../README.md) / viewportRuntimeConfig

# Variable: viewportRuntimeConfig

> `const` **viewportRuntimeConfig**: `object`

Process-wide defaults applied to every Viewport at construction.

Platforms that need different behavior (e.g. mobile/iOS, which must clamp the
zoom floor and defer DOM mutations during gestures to avoid WKWebView process
termination) override these once at startup, before any editor mounts. This
guarantees both the editor and the readonly preview viewports are born with
the same limits — avoiding the race and wrong-instance problems of patching a
single Viewport asynchronously after it has already mounted.

Desktop leaves these untouched, so its behavior is unchanged.

## Type Declaration

### CANVAS\_DPR\_CAP\_BY\_ZOOM

> **CANVAS\_DPR\_CAP\_BY\_ZOOM**: \[`number`, `number`\][]

Caps the canvas backing-store device-pixel-ratio at low zoom.

Each entry is `[zoomThreshold, dprCap]`, sorted ascending by threshold.
When the live zoom is below a threshold, the corresponding cap bounds the
effective dpr used to size canvases. Far-out zoom makes content tiny on
screen, so a full retina backing store is wasted memory — on iOS that waste
is what pushes WKWebView past its compositing budget and crashes the web
content process during pan/zoom.

Empty (the desktop default) means no cap: canvases always use the raw
`window.devicePixelRatio`, so desktop behavior is unchanged.

### LOW\_ZOOM\_GESTURE\_ACTIVE\_BLOCK\_LIMIT

> **LOW\_ZOOM\_GESTURE\_ACTIVE\_BLOCK\_LIMIT**: `number` = `0`

During low-zoom gesture survival mode, keep only a tiny subset of DOM blocks
as real active DOM (selected + a few nearby blocks). `0` keeps the legacy
behavior where every viewport block remains visually mounted as `survival`.

### LOW\_ZOOM\_GESTURE\_ACTIVE\_DISTANCE\_RATIO

> **LOW\_ZOOM\_GESTURE\_ACTIVE\_DISTANCE\_RATIO**: `number` = `0.35`

Distance threshold (as a fraction of the viewport's shorter side) used to
decide whether an unselected viewport block counts as "nearby" to the
current selection during low-zoom gesture survival mode.

### OVERSCAN\_RATIO

> **OVERSCAN\_RATIO**: `number` = `0`

Fraction by which the *render/activation* viewport bound is enlarged on
every side (see Viewport.overscanViewportBounds). Pre-painting a
margin around the visible area means moderate pan/zoom gestures move into
content that is already mounted and rasterized, so it does not blank out
and wait for the post-gesture refresh.

Memory grows by roughly `(1 + 2 * ratio) ** 2`, so this must stay modest
and be paired with a zoom floor + dpr cap on mobile. `0` (desktop default)
makes Viewport.overscanViewportBounds identical to
Viewport.viewportBounds, leaving desktop behavior unchanged.

This governs the *canvas* render bound only (see
Viewport.overscanViewportBounds). It enlarges the canvas backing
stores, so memory grows with the overscan area. Keep it modest and pair it
with the mobile zoom floor + dpr cap so connectors/elements stay painted
through a gesture without pushing WKWebView over budget.

### OVERSCAN\_RATIO\_BLOCK

> **OVERSCAN\_RATIO\_BLOCK**: `number` = `0`

Like [OVERSCAN\_RATIO](#overscan_ratio) but for the *DOM block mounting* bound (see
Viewport.overscanBlockBounds). This one is expensive: every
mounted block becomes its own composited layer subtree in the WebContent
process, so enlarging it multiplies resident memory and is what pushes the
process toward an iOS jetsam kill. Keep this small (or `0`) even when
[OVERSCAN\_RATIO](#overscan_ratio) is generous. `0` (desktop default) leaves block
mounting on the exact visible bound, unchanged from upstream.

### POST\_GESTURE\_REFRESH\_DELAY

> **POST\_GESTURE\_REFRESH\_DELAY**: `number` = `800`

Delay (ms) before the post-gesture refresh repaints canvases and reactivates
blocks, used only when [SKIP\_REFRESH\_DURING\_GESTURE](#skip_refresh_during_gesture) is true. The same
value drives both the canvas and block refresh timers so they fire together
(avoiding the "blocks appear, then connectors" staggered reveal). Desktop
never enters that code path, so this is mobile-only.

### SKIP\_REFRESH\_DURING\_GESTURE

> **SKIP\_REFRESH\_DURING\_GESTURE**: `boolean` = `false`

### VIEWPORT\_REFRESH\_MAX\_INTERVAL

> **VIEWPORT\_REFRESH\_MAX\_INTERVAL**: `number` = `120`

### VIEWPORT\_REFRESH\_PIXEL\_THRESHOLD

> **VIEWPORT\_REFRESH\_PIXEL\_THRESHOLD**: `number` = `18`

### ZOOM\_MAX

> **ZOOM\_MAX**: `number`

### ZOOM\_MIN

> **ZOOM\_MIN**: `number`
