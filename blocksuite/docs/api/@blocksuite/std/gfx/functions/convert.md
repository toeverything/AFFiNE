[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [gfx](../README.md) / convert

# Function: convert()

> **convert**\<`V`, `T`\>(`fn`): (`_`, `context`) => `ClassAccessorDecoratorResult`\<`T`, `V`\>

The convert decorator is used to convert the property value before it's
set to the Y map.

Note:
1. This decorator function will not execute in model initialization.

## Type Parameters

### V

`V`

### T

`T` *extends* `GfxPrimitiveElementModel`\<`BaseElementProps`\>

## Parameters

### fn

(`propValue`, `instance`) => `unknown`

## Returns

> (`_`, `context`): `ClassAccessorDecoratorResult`\<`T`, `V`\>

### Parameters

#### \_

`unknown`

#### context

`ClassAccessorDecoratorContext`

### Returns

`ClassAccessorDecoratorResult`\<`T`, `V`\>
