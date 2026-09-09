[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [index](../README.md) / createWebKitPencilActivityTracker

# Function: createWebKitPencilActivityTracker()

> **createWebKitPencilActivityTracker**(`options?`): `WebKitPencilActivityTracker`

Pencil-priority activity from WebKit `pointerType` only — no native GR, no
palm classification (`classify` always returns `undefined`).

Used on iPad when attaching `TouchClassifyingGestureRecognizer` to WKWebView
is unsafe. Enables [isPencilInputActive](isPencilInputActive.md) so finger-pan routing can run
while the Pencil is the active instrument (plus a short grace after lift).

## Parameters

### options?

#### graceMs?

`number`

## Returns

`WebKitPencilActivityTracker`
