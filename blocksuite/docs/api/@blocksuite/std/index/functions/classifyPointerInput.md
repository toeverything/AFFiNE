[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [index](../README.md) / classifyPointerInput

# Function: classifyPointerInput()

> **classifyPointerInput**(`event`): [`InputTouchKind`](../type-aliases/InputTouchKind.md) \| `undefined`

Convenience wrapper; safe to call on any platform.

The browser's `PointerEvent.pointerType` only distinguishes `pen` / `touch` /
`mouse` and cannot tell a resting palm from a deliberate finger. On platforms
that can see the real native touch type, such as iPadOS via `UITouch.TouchType`,
the host may inject a runtime classifier so edgeless pointer routing can reject
palm contact and keep an Apple Pencil stroke alive while a hand rests on the
screen.

When no classifier is injected, the function returns `undefined` and pointer
handling falls back to the browser-provided event data.

## Parameters

### event

`PointerEvent`

## Returns

[`InputTouchKind`](../type-aliases/InputTouchKind.md) \| `undefined`
