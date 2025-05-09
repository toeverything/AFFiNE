[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [gfx](../README.md) / PointTestOptions

# Interface: PointTestOptions

The options for the hit testing of a point.

## Properties

### hitThreshold?

> `optional` **hitThreshold**: `number`

The threshold of the hit test. The unit is pixel.

***

### ignoreTransparent?

> `optional` **ignoreTransparent**: `boolean`

If true, the transparent area of the element will be ignored during the point inclusion test.
Otherwise, the transparent area will be considered as filled area.

Default is true.

***

### responsePadding?

> `optional` **responsePadding**: \[`number`, `number`\]

The padding of the response area for each element when do the hit testing. The unit is pixel.
The first value is the padding for the x-axis, and the second value is the padding for the y-axis.

***

### useElementBound?

> `optional` **useElementBound**: `boolean`

If true, the element bound will be used for the hit testing.
By default, the response bound will be used.

***

### zoom?

> `optional` **zoom**: `number`

The zoom level of current view when do the hit testing.
