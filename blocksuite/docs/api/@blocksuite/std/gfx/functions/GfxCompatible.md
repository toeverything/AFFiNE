[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [gfx](../README.md) / GfxCompatible

# Function: GfxCompatible()

> **GfxCompatible**\<`Props`, `T`\>(`BlockModelSuperClass`): *typeof* [`GfxBlockElementModel`](../classes/GfxBlockElementModel.md)

Convert a BlockModel to a GfxBlockElementModel.

## Type Parameters

### Props

`Props` *extends* [`GfxCompatibleProps`](../type-aliases/GfxCompatibleProps.md)

### T

`T` *extends* `Constructor`\<`BlockModel`\<`Props`\>\> = `Constructor`\<`BlockModel`\<`Props`\>\>

## Parameters

### BlockModelSuperClass

`T`

The BlockModel class to be converted.

## Returns

*typeof* [`GfxBlockElementModel`](../classes/GfxBlockElementModel.md)

The returned class is a subclass of the GfxBlockElementModel class and the given BlockModelSuperClass.
