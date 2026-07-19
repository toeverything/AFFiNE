[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [gfx](../README.md) / getEffectiveDpr

# Function: getEffectiveDpr()

> **getEffectiveDpr**(`zoom`, `rawDpr?`): `number`

Resolves the effective device-pixel-ratio for canvas backing stores at the
given zoom, honoring [viewportRuntimeConfig.CANVAS\_DPR\_CAP\_BY\_ZOOM](../variables/viewportRuntimeConfig.md#canvas_dpr_cap_by_zoom).

Returns the raw `window.devicePixelRatio` when no cap applies.

## Parameters

### zoom

`number`

### rawDpr?

`number` = `window.devicePixelRatio`

## Returns

`number`
