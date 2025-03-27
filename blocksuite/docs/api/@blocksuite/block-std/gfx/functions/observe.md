[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/block-std](../../README.md) / [gfx](../README.md) / observe

# Function: observe()

> **observe**\<`V`, `E`, `T`\>(`fn`): (`_`, `context`) => `ClassAccessorDecoratorResult`\<`GfxPrimitiveElementModel`\<`BaseElementProps`\>, `V`\>

A decorator to observe the y type property.
You can think of it is just a decorator version of 'observe' method of Y.Array and Y.Map.

The observer function start to observe the property when the model is mounted. And it will
re-observe the property automatically when the value is altered.

## Type Parameters

### V

`V`

### E

`E` *extends* `YEvent`\<`any`\>

### T

`T` *extends* `GfxPrimitiveElementModel`\<`BaseElementProps`\>

## Parameters

### fn

`ObserveFn`\<`E`, `T`\>

## Returns

`Function`

### Parameters

#### \_

`unknown`

#### context

`ClassAccessorDecoratorContext`

### Returns

`ClassAccessorDecoratorResult`\<`GfxPrimitiveElementModel`\<`BaseElementProps`\>, `V`\>
