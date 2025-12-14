[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [gfx](../README.md) / GfxBlockElementModel

# Class: GfxBlockElementModel\<Props\>

The graphic block model that can be rendered in the graphics mode.
All the graphic block model should extend this class.
You can use `GfxCompatibleBlockModel` to convert a BlockModel to a subclass that extends it.

## Extends

- `BlockModel`\<`Props`\>

## Type Parameters

### Props

`Props` *extends* [`GfxCompatibleProps`](../type-aliases/GfxCompatibleProps.md) = [`GfxCompatibleProps`](../type-aliases/GfxCompatibleProps.md)

## Implements

- [`GfxCompatibleInterface`](../interfaces/GfxCompatibleInterface.md)

## Properties

### responseExtension

> **responseExtension**: \[`number`, `number`\]

Defines the extension of the response area beyond the element's bounding box.
This tuple specifies the horizontal and vertical margins to be added to the element's [x, y, width, height].

The first value represents the horizontal extension (added to both left and right sides),
and the second value represents the vertical extension (added to both top and bottom sides).

The response area is computed as:
`[x - horizontal, y - vertical, width + 2 * horizontal, height + 2 * vertical]`.

Example:
- Bounding box: `[0, 0, 100, 100]`, `responseExtension: [10, 20]`
  Resulting response area: `[-10, -20, 120, 140]`.
- `responseExtension: [0, 0]` keeps the response area equal to the bounding box.

#### Implementation of

[`GfxCompatibleInterface`](../interfaces/GfxCompatibleInterface.md).[`responseExtension`](../interfaces/GfxCompatibleInterface.md#responseextension)

## Accessors

### elementBound

#### Get Signature

> **get** **elementBound**(): `Bound`

The bound of the element without considering the response extension.

##### Returns

`Bound`

The bound of the element without considering the response extension.

#### Implementation of

[`GfxCompatibleInterface`](../interfaces/GfxCompatibleInterface.md).[`elementBound`](../interfaces/GfxCompatibleInterface.md#elementbound)

***

### lockedBySelf

#### Get Signature

> **get** **lockedBySelf**(): `boolean` \| `undefined`

Indicates whether the current block is explicitly locked by self.
For checking the lock status of the element, use `isLocked` instead.
For (un)locking the element, use `(un)lock` instead.

##### Returns

`boolean` \| `undefined`

#### Set Signature

> **set** **lockedBySelf**(`lockedBySelf`): `void`

Indicates whether the current block is explicitly locked by self.
For checking the lock status of the element, use `isLocked` instead.
For (un)locking the element, use `(un)lock` instead.

##### Parameters

###### lockedBySelf

`boolean` | `undefined`

##### Returns

`void`

Indicates whether the current block is explicitly locked by self.
For checking the lock status of the element, use `isLocked` instead.
For (un)locking the element, use `(un)lock` instead.

#### Implementation of

[`GfxCompatibleInterface`](../interfaces/GfxCompatibleInterface.md).[`lockedBySelf`](../interfaces/GfxCompatibleInterface.md#lockedbyself)

***

### responseBound

#### Get Signature

> **get** **responseBound**(): `Bound`

The bound of the element considering the response extension.

##### Returns

`Bound`

The bound of the element considering the response extension.

#### Implementation of

[`GfxCompatibleInterface`](../interfaces/GfxCompatibleInterface.md).[`responseBound`](../interfaces/GfxCompatibleInterface.md#responsebound)

## Methods

### isLocked()

> **isLocked**(): `boolean`

Check if the element is locked. It will check the lock status of the element and its ancestors.

#### Returns

`boolean`

#### Implementation of

[`GfxCompatibleInterface`](../interfaces/GfxCompatibleInterface.md).[`isLocked`](../interfaces/GfxCompatibleInterface.md#islocked)
