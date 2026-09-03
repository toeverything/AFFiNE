[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [index](../README.md) / InputTouchKind

# Type Alias: InputTouchKind

> **InputTouchKind** = `"pencil"` \| `"finger"` \| `"palm"`

Runtime-injectable pointer input classifier.

The browser's `PointerEvent.pointerType` only distinguishes `pen` / `touch` /
`mouse` and cannot tell a resting palm from a deliberate finger. On platforms
that can see the real native touch type (e.g. iPadOS via `UITouch.TouchType`),
the host injects a classifier here so the edgeless pointer routing can reject
palm contact and keep an Apple Pencil stroke alive while a hand rests on the
screen.

This mirrors the viewportRuntimeConfig injection pattern: the framework
stays platform-agnostic and simply consults the hook when present. When no
classifier is injected (desktop, web, Android) the getter returns `undefined`
and pointer handling behaves exactly as before.
