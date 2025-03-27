[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/block-std](../../README.md) / [gfx](../README.md) / watch

# Function: watch()

> **watch**\<`V`, `T`\>(`fn`): (`_`, `context`) => `ClassAccessorDecoratorResult`\<`GfxPrimitiveElementModel`\<`BaseElementProps`\>, `V`\>

The watch decorator is used to watch the property change of the element.
You can thinks of it as a decorator version of `elementUpdated` slot of the surface model.

## Type Parameters

### V

`V`

### T

`T` *extends* `GfxPrimitiveElementModel`\<`BaseElementProps`\>

## Parameters

### fn

`WatchFn`\<`T`\>

## Returns

`Function`

### Parameters

#### \_

`unknown`

#### context

`ClassAccessorDecoratorContext`

### Returns

`ClassAccessorDecoratorResult`\<`GfxPrimitiveElementModel`\<`BaseElementProps`\>, `V`\>
