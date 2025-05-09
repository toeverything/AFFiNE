[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [gfx](../README.md) / GfxGroupCompatibleInterface

# Interface: GfxGroupCompatibleInterface

GfxGroupCompatibleElement is a model that can contain other models.
It just like a group that in common graphic software.

## Extends

- [`GfxCompatibleInterface`](GfxCompatibleInterface.md)

## Properties

### childElements

> **childElements**: `GfxModel`[]

All child element models of this container.
Note that the `childElements` may not contains all the children in `childIds`,
because some children may not be loaded.

***

### childIds

> **childIds**: `string`[]

All child ids of this container.

***

### elementBound

> `readonly` **elementBound**: `Bound`

The bound of the element without considering the response extension.

#### Inherited from

[`GfxCompatibleInterface`](GfxCompatibleInterface.md).[`elementBound`](GfxCompatibleInterface.md#elementbound)

***

### forceFullRender?

> `optional` **forceFullRender**: `boolean`

Whether to disable fallback rendering for this element, e.g., during zooming.
Defaults to false (fallback to placeholder rendering is enabled).

#### Inherited from

[`GfxCompatibleInterface`](GfxCompatibleInterface.md).[`forceFullRender`](GfxCompatibleInterface.md#forcefullrender)

***

### lockedBySelf?

> `optional` **lockedBySelf**: `boolean`

Indicates whether the current block is explicitly locked by self.
For checking the lock status of the element, use `isLocked` instead.
For (un)locking the element, use `(un)lock` instead.

#### Inherited from

[`GfxCompatibleInterface`](GfxCompatibleInterface.md).[`lockedBySelf`](GfxCompatibleInterface.md#lockedbyself)

***

### responseBound

> `readonly` **responseBound**: `Bound`

The bound of the element considering the response extension.

#### Inherited from

[`GfxCompatibleInterface`](GfxCompatibleInterface.md).[`responseBound`](GfxCompatibleInterface.md#responsebound)

***

### responseExtension

> **responseExtension**: \[`number`, `number`\]

Defines the extension of the response area beyond the element's bounding box.
This tuple specifies the horizontal and vertical margins to be added to the element's bound.

The first value represents the horizontal extension (added to both left and right sides),
and the second value represents the vertical extension (added to both top and bottom sides).

The response area is computed as:
`[x - horizontal, y - vertical, w + 2 * horizontal, h + 2 * vertical]`.

Example:
- xywh: `[0, 0, 100, 100]`, `responseExtension: [10, 20]`
  Resulting response area: `[-10, -20, 120, 140]`.
- `responseExtension: [0, 0]` keeps the response area equal to the bounding box.

#### Inherited from

[`GfxCompatibleInterface`](GfxCompatibleInterface.md).[`responseExtension`](GfxCompatibleInterface.md#responseextension)

## Methods

### isLocked()

> **isLocked**(): `boolean`

Check if the element is locked. It will check the lock status of the element and its ancestors.

#### Returns

`boolean`

#### Inherited from

[`GfxCompatibleInterface`](GfxCompatibleInterface.md).[`isLocked`](GfxCompatibleInterface.md#islocked)
